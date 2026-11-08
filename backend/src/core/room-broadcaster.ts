import { EventEmitter } from "events";
import { RoomState, RoomRuntimeState, UserPrivate } from "../types.js";

interface RoomBroadcasterEvents {
  broadcast: [type: 'binary', message: Buffer] | [type: string, message: string];
}

type Listener<Data extends unknown[]> = (...data: Data) => void;

interface GenericEventEmitter<T extends Record<keyof T, T[keyof T]>> extends NodeJS.EventEmitter {
  on<U extends keyof T>(type: U, callback: Listener<T[U]>): void;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
}

type Builder<T> = { new(): T; };
const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;

export class RoomBroadcaster extends (EventEmitter as Builder<GenericEventEmitter<RoomBroadcasterEvents>>) {
  constructor(private roomstate: RoomState, private runtime: RoomRuntimeState) {
    super();
  }

  broadcast(
    message: Buffer | { type: string;[key: string]: any; },
    skip?: number | UserPrivate,
    reliable = true
  ) {
    if (Buffer.isBuffer(message)) {
      const stableMessage = Buffer.from(message);
      this.broadcastImpl(stableMessage, skip, reliable);
      this.emitSafely("binary", stableMessage);
    } else {
      const msgJson = JSON.stringify(message);
      this.broadcastImpl(msgJson, skip, reliable);
      this.emitSafely(message.type, msgJson);
    }
  }

  broadcast_slow(
    message: Buffer | { type: string;[key: string]: any; },
    origin: UserPrivate,
  ) {
    if (Buffer.isBuffer(message)) {
      const stableMessage = Buffer.from(message);
      this.broadcastSlowImpl(stableMessage, origin);
      this.emitSafely("binary", stableMessage);
    } else {
      const msgJson = JSON.stringify(message);
      this.broadcastSlowImpl(msgJson, origin);
      this.emitSafely(message.type, msgJson);
    }
  }

  broadcastRoomUsers() {
    const msg = {
      type: "users",
      users: this.runtime.users.map((u) => {
        const up = this.runtime.usersPriv.get(u.id);
        return {
          ...u,
          isHost: up?.ishost?.perms ? [...up.ishost.perms] : [],
          hasToken: !!up?.token
        };
      }),
    };

    this.broadcast(msg);
  }

  private broadcastImpl(b: Buffer | string, skip?: number | UserPrivate, reliable = true) {
    if (skip !== undefined) { // maybe i should trust the optimizer more
      for (const [uid, priv] of this.runtime.usersPriv.entries()) {
        if (uid == skip || priv == skip) continue;
        this.send(priv, b);
      }
    } else {
      for (const priv of this.runtime.usersPriv.values()) {
        if (!reliable && priv.unreliableReady) {
          try {
            priv.dc!.send(b as any); // trust me
          } catch {
            this.send(priv, b);
          }
        } else
          this.send(priv, b);
      }
    }
  }

  private broadcastSlowImpl(b: Buffer | string, origin: UserPrivate) {
    for (const priv of this.runtime.usersPriv.values()) {
      if (priv.muter.shouldMute(origin.ipaddr, origin.asn)) continue;
      this.send(priv, b);
    }
  }

  private send(priv: UserPrivate, message: Buffer | string) {
    if (priv.conn.readyState !== undefined && priv.conn.readyState !== 1) return;
    if ((priv.conn.bufferedAmount || 0) > MAX_BUFFERED_BYTES) {
      try {
        priv.conn.close(1013, "Client cannot keep up");
      } catch (error) {
        console.error("Failed to close backpressured websocket", error);
      }
      return;
    }
    try {
      priv.conn.send(message);
    } catch (error) {
      console.error("Failed to broadcast websocket message", error);
    }
  }

  private emitSafely(type: string, message: Buffer | string) {
    try {
      this.emit("broadcast", type, message as any);
    } catch (error) {
      console.error("Failed to record broadcast", error);
    }
  }
}
