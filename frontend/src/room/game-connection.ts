import { CMD_TYPE, type DecodedWireMessage } from "./common";
import { WsClient } from "./network/ws-client";
import { settings } from "$lib/room/stores";
import type { WireGroup } from "./types";
import type { Rectangle, vec2 } from "./vec2";
import { getEmotes, throttle } from "../utils";
import type { Group, PSet } from "$backend/types";
import { concatArrayBuffers } from "./network/serialization";
import { get } from "svelte/store";
import type { Permission } from "$lib/room/permissions";

export class GameConnection extends EventTarget {
  private reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  wsClient?: WsClient;
  private lastChatMessageTimestamp?: number;
  private readonly throttledMoveOperator = new ThrottledMoveOperator((groups) => this.wsClient?.send((e) => e.move(groups)), 50);

  public reconnectAttempt = 0;
  public receivedHeartBeat = false;
  private protocolReady = false;
  private connectionGeneration = 0;

  onMessage?: (msg: DecodedWireMessage) => void;

  constructor(private roomName: string) {
    super();
  }

  get isConnected() {
    return this.wsClient?.isConnected() || false;
  }

  get playerId() {
    return this.wsClient?.playerId;
  }

  connect() {
    if (!this.onMessage) {
      throw new Error("Must set onMessage handler before connecting");
    }

    this.dispatchEvent(new Event("connecting"));
    clearTimeout(this.reconnectTimeout);
    this.protocolReady = false;
    const generation = ++this.connectionGeneration;

    if (this.roomName.startsWith("offline-")) {
      const id = this.roomName.substring(8);
      import("./network/offline-emulator").then(({ OfflineSocketEmulator }) => {
        if (generation !== this.connectionGeneration) return;
        const emulator = new OfflineSocketEmulator(id, (msg) => {
          if (generation !== this.connectionGeneration) return;
          this.onMessage?.(msg);
        });

        this.wsClient = {
          playerId: 1,
          send: (encode: any) => {
            const dummyEncoder = {
              user: () => {},
              heartbeat: () => {},
              setVisibility: () => {},
              updateToken: () => {},
              updatePushSub: () => {},
              chat: () => {},
              emote: () => {},
              pick: (groups: any) => emulator.handleClientMessage({ type: "pick", groups }),
              move: (groups: any) => emulator.handleClientMessage({ type: "move", groups }),
              moveDelta: (dx: any, dy: any, groups: any) => emulator.handleClientMessage({ type: "moveDelta", dx, dy, groups }),
              drop: (groups: any) => emulator.handleClientMessage({ type: "drop", groups }),
              select: () => {},
              deselect: () => {},
              turn: (groups: any[]) => emulator.handleClientMessage({
                type: "rotate",
                rotations: groups.map(group => ({ id: group.id, rotation: group.rot }))
              }),
              flip: (groups: any[]) => emulator.handleClientMessage({
                type: "flip",
                flips: groups.map(group => ({ id: group.id, f: group.f }))
              }),
              merge: (groupIdA: any, groupIdB: any, x: any, y: any) => emulator.handleClientMessage({ type: "merge", groupIdA, groupIdB, x, y }),
              lock: (groups: any) => emulator.handleClientMessage({ type: "lock", groups }),
              unlock: (groups: any) => emulator.handleClientMessage({ type: "unlock", groups }),
              forceDrop: (groups: any) => {}
            };
            const mockMsg = encode(dummyEncoder);
            if (mockMsg && typeof mockMsg === 'object') {
              emulator.handleClientMessage(mockMsg);
            }
          },
          isConnected: () => true,
          closeConnection: async () => emulator.stop(),
          changeMode: () => {}
        } as any;

        this.onConnected();
        emulator.start();
      });
      return;
    }

    const wssServer = new URL(location.origin);
    wssServer.protocol = location.protocol.includes("https") ? 'wss' : 'ws';
    if (wssServer.host === "jiggie.fun" && get(settings).direct)
      wssServer.host = "ws.jiggie.fun";
    wssServer.pathname = "ws";
    const wssServerUrl = wssServer.toString();
    const client = new WsClient(wssServerUrl);
    this.wsClient = client;

    client.onConnected = () => {
      if (generation !== this.connectionGeneration || this.wsClient !== client) return;
      // authenticate the user
      const { savedname: username, savedcolor: color, secretforthisroom: secret, selected_token, bingotoken } = settings.snapshot();
      client.send((e) => e.user(username, color, this.roomName, secret, this.lastChatMessageTimestamp, selected_token || undefined, bingotoken));
    };

    client.onDisconnected = (reason, retry) => {
      if (generation !== this.connectionGeneration || this.wsClient !== client) return;
      this.onDisconnected(reason, retry, client);
    };

    client.addEventListener("message", (msg) => {
      if (generation !== this.connectionGeneration || this.wsClient !== client) return;
      const obj = (msg as CustomEvent<DecodedWireMessage>).detail;
      try {
        switch (obj.type) {
          case "chat":
            if (Number.isFinite(obj.ts))
              this.lastChatMessageTimestamp = Math.max(this.lastChatMessageTimestamp || 0, obj.ts!);
            break;
          case CMD_TYPE.HEARTBEAT:
            this.receivedHeartBeat = true;
            if (Number.isFinite(obj.drift))
              this.dispatchEvent(new CustomEvent("drift", { detail: obj.drift }))
            this.wsClient?.send((e) => e.heartbeat());
            break;
          case "ready":
            if (!this.protocolReady) {
              this.protocolReady = true;
              this.onConnected();
            }
            break;
        }

        this.onMessage?.(obj);
      } catch (e) {
        console.error("Failed to handle the message", e);
        this.onDisconnected((e as Error).message, true);
      }
    });
  }

  updateUser() {
    const { savedname: username, savedcolor: color, secretforthisroom: secret, bingotoken } = settings.snapshot();
    this.wsClient!.send((e) => e.user(username, color, this.roomName, secret, this.lastChatMessageTimestamp, undefined, bingotoken));
    this.updateToken();
  }

  updateToken() {
    const { selected_token } = settings.snapshot();
    if (selected_token) {
      this.wsClient!.send((e) => e.updateToken(selected_token));
    }
  }

  updatePushSub(p: PushSubscriptionJSON) {
    this.wsClient!.send((e) => e.updatePushSub(p));
  }

  addSet(intent: string, set: PSet, groups: Group[], new_board: vec2) {
    const data = JSON.stringify({ intent, set, groups, new_board });
    const dbuff = concatArrayBuffers([new Uint8Array([0xFE]), new TextEncoder().encode(data)]);
    this.wsClient!.send(e => new Uint8Array(dbuff));
  }

  private onConnected() {
    this.dispatchEvent(new Event("connected"));
    this.setVisibility();
    this.processPendingMuteCommands();

    // Auto-update push subscription last_seen state on backend
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.pushManager?.getSubscription().then((sub) => {
          if (sub) {
            this.updatePushSub(sub.toJSON());
          }
        }).catch((err) => console.error("Error getting push sub:", err));
      }).catch((err) => console.error("Error getting sw reg:", err));
    }
  }

  private processPendingMuteCommands() {
    const curSettings = settings.snapshot();
    const pendingCommands = curSettings.pending_mute_commands || [];

    if (pendingCommands.length === 0) return;

    // Get current mutelist to find clause IDs for unmute commands
    const mutelist = curSettings.mutelist || [];

    pendingCommands.forEach(cmd => {
      if (cmd.action === 'mute' && cmd.userId && cmd.type) {
        // Send /muteid command
        const range = cmd.type === 'ip' && cmd.range ? cmd.range : '';
        this.chat(`/muteid ${cmd.userId} ${cmd.type}${range ? ' ' + range : ''}`);
      } else if (cmd.action === 'unmute') {
        // Find the clause ID in the mutelist
        const clauseId = mutelist.findIndex(entry =>
          entry.userId === cmd.userId &&
          entry.userName === cmd.userName &&
          entry.timestamp === cmd.timestamp
        );

        if (clauseId !== -1) {
          this.chat(`/unmute ${clauseId}`);
        }
      }
    });

    // Clear the pending commands queue
    settings.update(s => {
      s.pending_mute_commands = [];
      return s;
    });
  }

  private onDisconnected(reason: string, retry: boolean, source?: WsClient) {
    if (source && this.wsClient !== source) return;
    this.protocolReady = false;
    this.receivedHeartBeat = false;
    if (!retry)
      this.dispatchEvent(new CustomEvent("drift", { detail: undefined }));
    this.dispatchEvent(new CustomEvent<{ reason: string; retry: boolean; }>("disconnected", { detail: { reason, retry } }));
    if (!retry) {
      return;
    }

    this.reconnectAttempt++;

    // geometric progression
    const delay = Math.min(100 * Math.pow(2, this.reconnectAttempt - 1), 5_000);
    const retryGeneration = this.connectionGeneration;
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(async () => {
      if (retryGeneration !== this.connectionGeneration
        || source && this.wsClient !== source) return;
      await this.close();
      if (this.connectionGeneration !== retryGeneration + 1 || this.wsClient) return;
      this.connect();
    }, delay);
  }

  changeMode(mode: any) {
    this.wsClient?.changeMode(mode);
  }

  resetRetryCounter() {
    this.reconnectAttempt = 0;
  }

  raw(obj: object) {
    this.wsClient?.send((e) => obj);
  }

  setVisibility() {
    if (this.wsClient?.isConnected()) {
      this.wsClient.send((e) => e.setVisibility());
    }
  }

  async close() {
    this.connectionGeneration++;
    clearTimeout(this.reconnectTimeout);
    const client = this.wsClient;
    await client?.closeConnection();
    if (this.wsClient === client)
      this.wsClient = undefined;
  }

  pick(groups: WireGroup[]) {
    this.throttledMoveOperator.cancelScheduled();
    this.wsClient?.send((e) => e.pick(groups));
  }

  move(groups: WireGroup[]) {
    this.throttledMoveOperator.move(groups);
  }

  drop(groups: WireGroup[]) {
    this.throttledMoveOperator.cancelScheduled();
    this.wsClient?.send((e) => e.drop(groups));
  }

  select(groups: WireGroup[]) {
    this.throttledMoveOperator.invokeScheduled();
    this.wsClient?.send((e) => e.select(groups));
  }

  deselect(groups: WireGroup[]) {
    this.throttledMoveOperator.invokeScheduled();
    this.wsClient?.send((e) => e.deselect(groups));
  }

  lock(groups: WireGroup[]) {
    this.throttledMoveOperator.invokeScheduled();
    this.wsClient?.send((e) => e.lock(groups));
  }

  unlock(groups: WireGroup[]) {
    this.throttledMoveOperator.invokeScheduled();
    this.wsClient?.send((e) => e.unlock(groups));
  }

  forceDrop(groups: WireGroup[]) {
    this.wsClient?.send((e) => e.forceDrop(groups));
  }

  sendKaoPosition(id: number, x: number, y: number) {
    this.wsClient?.send((e) => e.sendKaoPosition(id, x, y));
  }

  pickKao(id: number) {
    this.wsClient?.send((e) => e.pickKao(id));
  }

  releaseKao(id: number) {
    this.wsClient?.send((e) => e.releaseKao(id));
  }

  setJc(id: number, x: number, y: number, smd: 0 | 1 | 2) {
    this.wsClient?.send((e) => e.setJc(id, x, y, smd));
  }

  patJc(id: number, patting: boolean) {
    this.wsClient?.send((e) => e.patJc(id, !patting));
  }

  sendRegion(region: Rectangle) {
    this.chat(`/setupZone ${region.flat().join(" ")}`);
  }

  solveRecord(discId: number) {
    this.wsClient?.send((e) => e.solveRecord(discId));
  }

  kick(userId: number, secret: string) {
    this.wsClient?.send((e) => e.kick(userId, secret));
  }

  votekick(userId: number) {
    this.wsClient?.send((e) => e.votekick(userId));
  }

  promote(userId: number, r: Permission[]) {
    this.wsClient?.send((e) => e.promote(userId, r));
  }

  mute(userId: number, arg: { type: 'asn'; } | { type: 'ip', range: 'exact' | 'narrow' | 'large'; }) {
    this.wsClient?.send((e) => e.muteuser(userId, arg));
  }

  requestFollow(userId: number, events: number) {
    this.chat(`/requestfollowid ${userId} ${events}`);
  }

  unkickAll(secret: string) {
    this.wsClient?.send((e) => e.unkickAll(secret));
  }

  whisper(msg: string, id: number) {
    this.wsClient?.send((e) => ({
      type: "whisperid",
      id: id,
      msg: ";" + msg,
    }));
  }

  changeRules(
    secret: string,
    hidePreview: boolean,
    votekick: boolean,
    noMultiSelect: boolean,
    noLockUnlock: boolean,
    noBoxSelect: boolean,
    noStack: boolean,
    jigchan: boolean
  ) {
    this.wsClient?.send((e) => e.changeRules(secret, hidePreview, votekick, noMultiSelect, noLockUnlock, noBoxSelect, noStack, jigchan));
  }

  chat(message: string) {
    this.wsClient?.send((e) => e.chat(message));
  }

  emote(message: string) {
    const emotes = getEmotes(message);
    this.wsClient?.send((e) => e.emote(emotes));
  }

  turn(groups: (WireGroup & { rot?: number })[]) {
    this.wsClient?.send((e) => e.turn(groups));
  }

  flip(groups: (WireGroup & { rot?: number })[]) {
    this.wsClient?.send((e) => e.flip(groups));
  }

  merge(groupIdA: number, groupIdB: number, x: number, y: number) {
    this.wsClient?.send((e) => e.merge(groupIdA, groupIdB, x, y));
  }
}

class ThrottledMoveOperator {
  private readonly throttleAffectedGroups = new Set<WireGroup>();
  private readonly moveThrottledFn;

  constructor(moveFn: (e: WireGroup[]) => void, delay: number) {
    this.moveThrottledFn = throttle(
      () => {
        moveFn(Array.from(this.throttleAffectedGroups));
        this.throttleAffectedGroups.clear();
      },
      delay,
      true
    );
  }

  move(groups: WireGroup[]) {
    for (const g of groups) {
      this.throttleAffectedGroups.add(g);
    }

    this.moveThrottledFn.call();
  }

  cancelScheduled() {
    this.moveThrottledFn.cancelScheduled();
    this.throttleAffectedGroups.clear();
  }

  invokeScheduled() {
    this.moveThrottledFn.invokeScheduled();
  }
}
