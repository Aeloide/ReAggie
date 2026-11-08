export class Connection {
  private ws: WebSocket;
  private closePromise?: Promise<void>;

  onConnected: () => void = () => {};
  onDisconnected: (reason: string, retry: boolean) => void = () => {};
  onMessage: (rawData: ArrayBuffer | string) => void = () => {};

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => this.onConnected();

    this.ws.onclose = (e) => {
      console.log(`Websocket closed ${e.wasClean ? "cleanly." : "abruptly!"} (Code ${e.code}): ${e.reason}`, e);

      if (e.reason === "No such room") {
        const notFoundMsg = "Uh-oh! We couldn't find that room. It might have been deleted or self-destructed.";
        this.onDisconnected(notFoundMsg, false);
        return;
      }

      let msg = "Connection closed";
      if (e.reason) {
        msg += `. Reason: ${e.reason}`;
      }

      const TRY_AGAIN_LATER_CODE = 1013;
      const retry = !e.wasClean || e.code === TRY_AGAIN_LATER_CODE;
      this.onDisconnected(msg, retry);
    };

    this.ws.onmessage = (ev: MessageEvent<ArrayBuffer | string>) => {
      const data = ev.data;
      if (!data) {
        console.warn("Malformed WebSocket message", ev);
        return;
      }

      this.onMessage(data);
    };
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(data: any) {
    if (!this.isConnected()) {
      console.warn(`Can't send data: Socket is disconnected.`, data);
      return;
    }

    if (data instanceof Uint8Array) {
      this.ws.send(data);
    } else {
      this.ws.send(JSON.stringify(data));
    }
  }

  close() {
    if (this.closePromise) return this.closePromise;
    this.ws.onopen = () => {};
    this.ws.onclose = () => {};
    this.ws.onmessage = () => {};

    this.closePromise = new Promise<void>((resolve) => {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        const timeout = setTimeout(() => resolve(), 1_000);
        this.ws.onclose = (event) => {
          clearTimeout(timeout);
          resolve();
        };
        try {
          this.ws.close();
        } catch {
          clearTimeout(timeout);
          resolve();
        }
      } else {
        try {
          this.ws.close();
        } finally {
          resolve();
        }
      }
    });
    return this.closePromise;
  }
}
