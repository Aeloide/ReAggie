import type { Game, GameGroup, GamePiece } from "./game";
import type { GameConnection } from "./game-connection";
import type { JukeRecord, NameTagEvent, Room, RoomUpdate, User, WireGroup, jsonObj, track } from "./types";
import type { UiStateHandler } from "./ui-state-handler";

import { toRgbaNum } from "../utils";
import { CMD_TYPE, ROTATION, type DecodedWireMessage } from "./common";
import { RandomSequencer, TrackSequencer } from "./sequencer";
import { RoomCommandsInterpolator } from "./room-commands-interpolator";
import type { PollManager, NotesManager } from "./EntityManager";
import type { EndStats } from "$lib/room/stores";
import type { Group, PSet } from "$backend/types";
import { MediaSetLoader } from "./media-set-loader";
import { getAssetUrl } from "$lib";
import type { vec2 } from "./vec2";
import { Permissions } from "$lib/room/permissions";
import { settings, followReqs, roomState } from "$lib/room/stores";

const APP_VERSION = "1.8.0";

export class RoomMessageHandler {
  private readonly conn?: GameConnection;
  private readonly uiHandler?: UiStateHandler;

  constructor(private readonly game: Game, private readonly interpolator: RoomCommandsInterpolator) {
    this.conn = game.connection;
    this.conn?.addEventListener("drift", (ev) => {
      const drift = (ev as CustomEvent<number | undefined>).detail;
      this.uiHandler?.updateDrift(drift);
    })
    this.uiHandler = game.uiStateHandler;
  }

  // this function is so fucking gay, like what the fuck
  handle(msg: DecodedWireMessage) {
    switch (msg.type) {
      case "version":
        this.onVersion(msg.version);
        break;
      case "noroom":
        this.onNoRoom();
        break;
      case "upgrade":
        this.onUpgrade(msg.secret);
        break;
      case "users":
        this.onUsers(msg.users);
        break;
      case "room":
        this.onRoom(msg.room);
        break;
      case "endstats":
        this.onEndStats(msg);
        break;
      case "update":
        this.onUpdate(msg.room);
        break;
      case "zones":
        this.onZones(msg);
        break;
      case "notes":
        this.onNotes(msg);
        break;
      case "chat":
        this.onChat(msg.id, msg.name, msg.color, msg.message, msg.ts);
        break;
      case "emote":
        this.onEmote(msg.id, msg.name, msg.color, msg.emotes);
        break;
      case "botnet":
        this.onBotnet();
        break;
      case "proc":
        this.onProc(msg.id, msg.code);
        break;
      case "remproc":
        this.onRemProc(msg.id);
        break;
      case "points":
        this.onPoints(msg.qty);
        break;
      case "playlist":
        this.onPlaylist(msg.playlist, msg.currentlyPlaying, msg.ext, msg.timeStarted, msg.stop, msg.minPrice, msg.reschedule);
        break;
      case "scratch-card":
        this.uiHandler?.scratchCardSync(msg.choice, msg.val, msg.pts, msg.status);
        break;
      case CMD_TYPE.PICK:
        this.onPick(msg.userId, msg.groups);
        break;
      case CMD_TYPE.MOVE:
        this.onMove(msg.userId, msg.groups);
        break;
      case CMD_TYPE.DROP:
        this.onDrop(msg.userId, msg.groups);
        break;
      case CMD_TYPE.SELECT:
        this.onSelect(msg.userId, msg.groupIds);
        break;
      case CMD_TYPE.DESELECT:
        this.onDeselect(msg.userId, msg.groupIds);
        break;
      case CMD_TYPE.LOCK:
        this.onLock(msg.userId, msg.groupIds);
        break;
      case CMD_TYPE.UNLOCK:
        this.onUnlock(msg.userId, msg.groupIds);
        break;
      case CMD_TYPE.STEAL:
        this.onSteal(msg.userId, msg.groupIds);
        break;
      case CMD_TYPE.MERGE:
        this.onMerge(msg.userId, msg.groupIdA, msg.groupIdB, msg.x, msg.y);
        break;
      case CMD_TYPE.ROTATE:
        this.onRotate(msg.userId, msg.rotations);
        break;
      case CMD_TYPE.FLIP:
        this.onFlip(msg.userId, msg.flips);
        break;
      case CMD_TYPE.RECORD_UPDATE:
        this.onJukeRecords(msg.userId, msg.records);
        break;
      case CMD_TYPE.ROT_UPDATE:
        this.onRottingUpdate(msg.groupIdsWithTimestamps);
        break;
      case CMD_TYPE.SET_COMMITTED:
        this.onSetSticky(msg.groupIds);
        break;
      case CMD_TYPE.UNSET_COMMITTED:
        this.onUnsetSticky(msg.groupId);
        break;
      case CMD_TYPE.PICK_KAO:
        this.onPickKao(msg.id);
        break;
      case CMD_TYPE.RELEASE_KAO:
        this.onReleaseKao(msg.id);
        break;
      case CMD_TYPE.MOVE_KAO:
        this.onKaoMove(msg.id, msg.x, msg.y);
        break;
      case CMD_TYPE.SET_KAOS:
        this.onSetKaos(msg.kaos);
        break;
      case CMD_TYPE.EM_PROC:
        this.onEmProc(msg.payload);
        break;
      case CMD_TYPE.NEW_SET:
        this.onNewSet(msg.new_board, msg.set, msg.groups)
        break;
      case "mute":
        this.onMute(msg.id, msg.uid);
        break;
      case "followreq":
        this.onFollowReq(msg.origin, msg.events, msg.rid);
        break;
      case "position_correction":
        this.onPositionCorrection(msg.groups);
        break;
      case "cleanup_layout":
        this.onCleanupLayout(msg);
        break;
      case "push_groups":
        this.onPushGroups(msg.groups);
        break;
    }
  }

  private onFollowReq(origin: number, events: number, rid: string) {
    // Import followReqs from stores, assuming it was added in the imports at the top
    followReqs.addRequest({ origin, events, rid });
  }

  private onPositionCorrection(groups: WireGroup[]) {
    for (const correction of groups) {
      const group = this.game.state.transformedboard[correction.id];
      if (!group || group.id !== correction.id) continue;
      this.interpolator.stop(group, correction.x, correction.y);
      group.dirty = true;
    }
  }

  private onMute(id: string, uid: number) {
    settings.update(s => {
      const mutelist = s.mutelist || [];
      // Find the most recent mute for this user that doesn't have an ID yet
      const entryIdx = mutelist.findIndex(m => m.userId === uid && !m.id);
      if (entryIdx !== -1) {
        mutelist[entryIdx].id = id;
      } else {
        // Fallback: try to find any mute for this user
        const anyEntryIdx = mutelist.findIndex(m => m.userId === uid);
        if (anyEntryIdx !== -1) {
          mutelist[anyEntryIdx].id = id;
        }
      }
      return { ...s, mutelist };
    });
  }

  private onVersion(version: string) {
    version !== APP_VERSION && location.reload();
  }

  private onNoRoom() {
    location.reload();
  }

  private onUpgrade(secret: string) {
    this.uiHandler?.updateSecret(secret, this.game.roomName!);
  }

  private onUsers(newUsers: any[]) {
    this.game.roomUsers = newUsers.map(u => {
      let isHost = u.isHost;
      if (typeof isHost === 'number') {
        isHost = Permissions.fromLegacy(isHost);
      } else if (Array.isArray(isHost) || isHost instanceof Set) {
        isHost = new Permissions(isHost);
      } else if (!(isHost instanceof Permissions)) {
        isHost = new Permissions();
      }
      return { ...u, isHost, highlight: toRgbaNum(u.color), isMe: u.id === this.game.connection?.playerId };
    });

    this.uiHandler?.syncUsers(this.game.roomUsers);

    // Refresh user references
    this.game.state.groups.forEach((group) => {
      if (!group.user) return;
      group.user = this.game.getUserById(group.user.id);
    });
  }

  private onRoom(room: Room) {
    this.conn?.resetRetryCounter();
    // fillMissingGroups(room);
    room.tabSize = +room.tabSize;
    room.jitter = +room.jitter;
    room.cornerJitter = +room.cornerJitter;
    room.sets.forEach(e => {
      e.pieceWidth ||= e.width / e.cols;
      e.pieceHeight ||= e.height / e.rows;
    })
    this.game.setRoomDef(structuredClone(room));
    roomState.setCompleted(!!room.endTime);

    this.uiHandler?.syncRoomDef(this.game.roomdef);
  }

  private onUpdate(room: RoomUpdate) {
    const roomdef = this.game.roomdef;
    Object.assign(roomdef, structuredClone(room));
    if ("endTime" in room)
      roomState.setCompleted(!!room.endTime);
    if (!this.game.rules.canMultiselect()) {
      this.game.actions.deselectSelected();
    }
    this.game.view.boardWidth = roomdef.boardWidth;
    this.game.view.boardHeight = roomdef.boardHeight;
    const scale = this.game.actions.limitZoom(
      this.game.view.scale,
      !!settings.snapshot().imblind
    );
    this.game.actions.setViewPos(this.game.view.x, this.game.view.y, scale);
    this.game.view.dispatchEvent(new CustomEvent("view_change"));
    this.uiHandler?.updateRoomDef(roomdef);
  }

  private onEndStats(endstats: EndStats) {
    this.uiHandler?.updateEndStats(endstats);
  }

  private onChat(id: number, name: string, color: string, message: string, ts?: number) {
    this.uiHandler?.addChatMessage(id, name, color, message, ts);
  }

  private onEmote(id: number, name: string, color: string, emotes: string[]) {
    this.uiHandler?.addEmoteMessage(id, name, color, emotes);
  }

  private onBotnet() {
    this.uiHandler?.doBotnet();
  }

  private onProc(id: number, code: string) {
    this.uiHandler?.addProc(id, code);
  }

  private onRemProc(id: number) {
    this.uiHandler?.removeProc(id);
  }

  private onPoints(qty: number) {
    this.uiHandler?.jukeboxSyncPoints(qty);
  }

  private onPlaylist(
    playlist?: track[],
    currentlyPlaying?: string,
    ext?: string,
    timeStarted?: number,
    stop?: boolean,
    minPrice?: number,
    reschedule?: boolean
  ) {
    this.uiHandler?.jukeboxSyncPlaylist(this.game.roomdef, playlist, currentlyPlaying, ext, timeStarted, stop, minPrice, reschedule);
  }

  private onPick(userId: number, groups: WireGroup[]) {
    const user = this.game.getUserById(userId);
    for (const g of groups) {
      const group = this.game.state.transformedboard[g.id];
      if (!group) continue;
      this.interpolator.set(group, g.x, g.y);
      this.game.actions.stopDragging(group);
      group.user = user;
      this.game.state.reorderGroupBySize(group);
    }
    this.recountHeldPieces();
  }

  private onDrop(userId: number, groups: WireGroup[]) {
    for (const g of groups) {
      const group = this.game.state.transformedboard[g.id];
      if (!group) continue;

      this.interpolator.stop(group, g.x, g.y);

      if (!group.selectedByOther) {
        //Released & Not selected (i.e. a single group move)
        group.user = undefined;
        group.dirty = true;
      }
    }
    this.recountHeldPieces();
  }

  private onMove(userId: number, groups: WireGroup[]) {
    let syncRequired = false;

    for (const g of groups) {
      const group = this.game.state.transformedboard[g.id];
      if (!group) continue;
      if (group.id != g.id) continue; // move command didn't use the canonical name

      this.interpolator.set(group, g.x, g.y);

      if (!group.user) {
        syncRequired = true;
      }
    }

    // syncs shouldn't even be required if the messages are buffered and the initial state includes the group owners

    // // after initial connection some pieces might be moving around, so users have to be assigned
    // // this might happen only once after connection
    if (syncRequired) {
      const user = this.game.getUserById(userId);
      for (const g of groups) {
        const group = this.game.state.transformedboard[g.id];
        if (!group) continue;
        group.user = user;
      }
      this.recountHeldPieces();
    }
  }

  private onSelect(userId: number, groupIds: number[]) {
    const user = this.game.getUserById(userId);
    for (const groupId of groupIds) {
      const group = this.game.state.transformedboard[groupId];
      if (!group) continue;
      this.game.actions.stopDragging(group);
      group.user = user;
      group.selectedByOther = true;
      group.dirty = true;
    }
    this.recountHeldPieces();
  }

  private onDeselect(userId: number, groupIds: number[]) {
    for (const groupId of groupIds) {
      const group = this.game.state.transformedboard[groupId];
      if (!group) continue;
      group.user = void 0;
      group.selectedByOther = false;
      group.dirty = true;
    }
    this.recountHeldPieces();
  }

  private onSteal(userId: number, groupIds: number[]) {
    for (const groupId of groupIds) {
      const group = this.game.state.transformedboard[groupId];
      if (!group) continue;
      group.user = void 0;
      group.selectedByOther = false;
      this.game.actions.stopDragging(group);
      this.drawTagEvent(userId, group, "steal");
    }
    this.recountHeldPieces();
  }

  private onLock(userId: number, groupIds: number[]) {
    for (const groupId of groupIds) {
      const group = this.game.state.transformedboard[groupId];
      if (!group) continue;
      group.locked = true;
      group.selected = false;
      group.selectedByOther = false;
      group.user = undefined;
      this.game.actions.stopDragging(group, true);
      this.uiHandler?.refreshLockedDisplay(this.game.state.groups);
      this.drawTagEvent(userId, group, "lock");
    }
    this.recountHeldPieces();
  }

  private onUnlock(userId: number, groupIds: number[]) {
    for (const groupId of groupIds) {
      const group = this.game.state.transformedboard[groupId];
      if (!group) continue;
      group.locked = false;
      this.game.actions.stopDragging(group);
      this.uiHandler?.refreshLockedDisplay(this.game.state.groups);
      this.drawTagEvent(userId, group, "unlock");
    }
    this.recountHeldPieces();
  }

  private onMerge(userId: number, groupIdA: number, groupIdB: number, x: number, y: number) {
    let groupA = this.game.state.transformedboard[groupIdA],
      groupB = this.game.state.transformedboard[groupIdB];
    if (groupA && groupB && groupA !== groupB) {
      this.interpolator.cancel(groupA);
      this.interpolator.cancel(groupB);
      this.game.actions.stopDragging(groupA);
      this.game.actions.stopDragging(groupB, true);
      let group = this.game.actions.mergeGroups(groupA, groupB, false, false);
      this.interpolator.stop(group, x, y);
      this.game.state.reorderGroupBySize(group);
    }
    this.recountHeldPieces();
  }

  private onRotate(userId: number, rotations: { id: number; rotation: ROTATION }[]) {
    for (const r of rotations) {
      const group = this.game.state.transformedboard[r.id];
      if (!group) continue;
      this.game.state.setGroupRotation(group, r.rotation);
      this.drawTagEvent(userId, group, "rotate");
    }
  }

  private onFlip(userId: number, flips: { id: number; f: boolean }[]) {
    for (const r of flips) {
      const group = this.game.state.transformedboard[r.id];
      if (!group) continue;
      this.game.state.setGroupFlip(group, r.f);
      this.drawTagEvent(userId, group, "rotate");
    }
  }

  private onRottingUpdate(groups: [number, number][]) {
    groups.forEach(([id, ts]) => {
      this.game.state.transformedboard[id]!.rotp = ts;
    });
  }

  private onSetSticky(gid: number[]) {
    gid.forEach((g) => {
      const v = this.game.state.transformedboard[g];
      if (v) this.game.view.stickied.add(v);
    });
  }

  private onUnsetSticky(val: number) {
    this.game.view.stickied.delete([...this.game.view.stickied].find((e) => e.id == val)!);
  }

  pm?: PollManager;
  private onPickKao(id: number) {
    if (!this.pm) {
      this.pm = this.game.entities[3];
      if (!this.pm) return;
    }
    this.pm.pickKao(id);
  }

  private onReleaseKao(id: number) {
    if (!this.pm) {
      this.pm = this.game.entities[3];
      if (!this.pm) return;
    }
    this.pm.releaseKao(id);
  }

  private onKaoMove(id: number, x: number, y: number) {
    if (!this.pm) {
      this.pm = this.game.entities[3];
      if (!this.pm) return;
    }
    const kao = this.pm.kaos.get(id);
    if (!kao)
      return;
    kao.x = x;
    kao.y = y;
  }

  private onSetKaos(kaos: [number, number][]) {
    if (!this.pm) {
      this.pm = this.game.entities[3];
      if (!this.pm) return;
    }

    this.pm.setKaos(kaos);
  }

  private onEmProc(pl: DataView) {
    const em = this.game.entities[pl.getInt8(1)];
    if (!em) return;
    em.process(pl);
  }

  private async onNewSet(new_board: vec2, set: PSet, groups: Group[]) {
    // broken: events that occur during loading the image may be missed
    const res = await MediaSetLoader.loadImage(getAssetUrl(set.image), set);
    this.game.view.boardWidth = this.game.roomdef.boardWidth = new_board[0];
    this.game.view.boardHeight = this.game.roomdef.boardHeight = new_board[1];
    this.game.injectSet({
      set, groups, res
    })
    this.uiHandler?.syncRoomDef(this.game.roomdef);
  }

  private onZones(zonemsg: Extract<jsonObj, { type: "zones" }>) {
    if (!this.pm) {
      this.pm = this.game.entities[3];
      if (!this.pm) return;
    }

    this.pm.zones = zonemsg.zones;

    if (zonemsg.track) {
      this.game.sequencer = new TrackSequencer(zonemsg.track);
      // type inspection probably costs less than allocation and garbage collection?
    } else if (!(this.game.sequencer instanceof RandomSequencer)) {
      this.game.sequencer = new RandomSequencer();
    }

    this.uiHandler?.syncPoll(zonemsg);
  }

  nm?: NotesManager;
  private onNotes(msg: Extract<jsonObj, { type: "notes" }>) {
    if (!this.nm) {
      this.nm = this.game.entities[5];
      if (!this.nm) return; // Should not happen if registered correctly
    }
    this.nm.setNotes(msg.notes);
  }

  private onJukeRecords(userId: number, records: JukeRecord[]) {
    this.game.records = records;
  }

  private recountHeldPieces() {
    this.uiHandler?.recountHeldPieces(this.game.state.groups);
  }

  private drawTagEvent(userId: number, group: GameGroup, type?: NameTagEvent) {
    this.uiHandler?.drawTagEvent(userId, group, this.game.view, type);
  }

  private onCleanupLayout(msg: { initialLayout: Group[] }) {
    const initialLayout = msg.initialLayout;
    if (!initialLayout || !Array.isArray(initialLayout)) return;

    const framesBySet = new Map<number, GameGroup>();
    for (const group of this.game.state.groups) {
      const setIndex = group.set;
      const set = this.game.roomdef.sets[setIndex];
      if (!set) continue;

      let cornerCount = 0;
      for (const piece of group.pieces) {
        const isTopLeft = piece.xi === 0 && piece.yi === 0;
        const isTopRight = piece.xi === set.cols - 1 && piece.yi === 0;
        const isBottomLeft = piece.xi === 0 && piece.yi === set.rows - 1;
        const isBottomRight = piece.xi === set.cols - 1 && piece.yi === set.rows - 1;
        if (isTopLeft || isTopRight || isBottomLeft || isBottomRight) {
          cornerCount++;
        }
      }

      if (cornerCount >= 3) {
        if (!framesBySet.has(setIndex) || group.pieces.length > framesBySet.get(setIndex)!.pieces.length) {
          framesBySet.set(setIndex, group);
        }
      }
    }

    const groupsToReset: WireGroup[] = [];
    for (const group of this.game.state.groups) {
      if (group.x >= 0xDEAD0000 || group.y >= 0xDEAD0000) continue;
      if (group.pieces.length !== 1) continue;
      if (group.locked) continue;

      const setIndex = group.set;
      const frame = framesBySet.get(setIndex);

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      // we don't move pieces that are inside the frame
      // skipping the check for frames that don't exist, which leaves the rect at Infinity, so all pieces will be outside and reset to initial positions
      if (frame)
        for (const p of frame.pieces) {
          if (p.globalX < minX) minX = p.globalX;
          if (p.globalX > maxX) maxX = p.globalX;
          if (p.globalY < minY) minY = p.globalY;
          if (p.globalY > maxY) maxY = p.globalY;
        }

      const piece = group.pieces[0];
      // if the piece is outside the frame, reset it to its initial position
      if (piece.globalX < minX || piece.globalX > maxX || piece.globalY < minY || piece.globalY > maxY) {
        const initialGroup = initialLayout.find((g: any) => g.set === setIndex && g.indices.includes(piece.index));
        if (initialGroup) {
          groupsToReset.push({
            id: group.id,
            x: initialGroup.x,
            y: initialGroup.y
          });
        }
      }
    }

    if (groupsToReset.length > 0) {
      this.conn?.raw({ type: "cleanup_positions", groups: groupsToReset });
    }
  }

  private onPushGroups(groups: Group[]) {
    if (!groups || !Array.isArray(groups)) return;

    // Iterate through all newly pushed groups from the server
    for (const group of groups) {
      const setIndex = group.set;
      const pieceIndices = new Set(group.indices);

      // Filter out any matching client-side dummy/placeholder groups
      // that contain pieces now included in the newly revealed real groups
      this.game.roomdef.groups = this.game.roomdef.groups.filter((g: any) => {
        if (g.set !== setIndex) return true;
        const hasOverlap = g.indices.some((idx: number) => pieceIndices.has(idx));
        if (hasOverlap) {
          // Remove the dummy group from the current game state groups list
          const stateGroupIdx = this.game.state.groups.findIndex((sg: any) => sg.id === g.id);
          if (stateGroupIdx !== -1) {
            const stateGroup = this.game.state.groups[stateGroupIdx];
            // Stop any interaction/dragging context on the old group
            this.game.actions.stopDragging(stateGroup, true);
            this.game.state.groups.splice(stateGroupIdx, 1);
          }
          // Clean up reference pointers in transformedboard layout mapping
          delete this.game.state.transformedboard[g.id];
          if (g.ids) {
            for (const id of g.ids) {
              delete this.game.state.transformedboard[id];
            }
          }
          return false; // Remove this group from roomdef.groups
        }
        return true;
      });
    }

    // Append the newly pushed groups containing the revealed pieces to the game state
    this.game.appendGroups(groups);
    // Request canvas redraw to render the new pieces in their updated coordinates
    this.game.view.dispatchEvent(new CustomEvent("view_change"));
  }
}

function fillMissingGroups(room: Room) {
  let base = 0;
  for (let setIndex = 0; setIndex < room.sets.length; setIndex++) {
    const set = room.sets[setIndex];
    if (!set) continue;

    let totalPieces = 0;
    if (set.sites && set.sites.length > 0) {
      totalPieces = set.count || room.pieces;
    } else {
      totalPieces = set.cols * set.rows;
    }

    const presentIndices = new Set<number>();
    for (const group of room.groups) {
      if (group.set === setIndex) {
        for (const idx of group.indices) {
          presentIndices.add(idx);
        }
      }
    }

    for (let idx = 0; idx < totalPieces; idx++) {
      const dummyGroupId = base + idx;
      if (!presentIndices.has(dummyGroupId)) {
        room.groups.push({
          id: dummyGroupId,
          ids: [],
          indices: [dummyGroupId],
          set: setIndex,
          x: -10000,
          y: -10000,
          rot: 0,
          f: false,
          locked: false
        });
      }
    }
    base += totalPieces;
  }
}
