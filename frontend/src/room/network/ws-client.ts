import { CMD_TYPE, type DecodedWireMessage } from "../common";
import { Connection } from "./connection";
import { MessageDecoder } from "./message-decoder";
import { MessageEncoder } from "./message-encoder";

type ProcessingMode = "buffer" | "process";

export class WsClient extends EventTarget {
  private connection: Connection;
  private encoder: MessageEncoder;
  private decoder: MessageDecoder;

  private peer?: RTCPeerConnection;
  private dc?: RTCDataChannel;
  get unreliableStarted() {
    return !!this.peer;
  }

  get unreliableReady() {
    return this.dc?.readyState == "open";
  }

  private processingMode: ProcessingMode = "buffer";
  private processingBuffer: DecodedWireMessage[] = [];

  playerId?: number;

  onConnected: () => void = () => { };
  onDisconnected: (reason: string, retry: boolean) => void = () => { };

  async doUnreliableNegociation() {
    this.peer!.onicecandidate = (event) => {
      if (event.candidate) {
        this.connection.send(({ type: "webrtc_candidate", candidate: event.candidate }));
      }
    };
    const offer = await this.peer!.createOffer();
    this.peer!.setLocalDescription(offer);
    this.connection.send(({ type: "webrtc_negociation", offer }));
  }

  constructor(url: string) {
    super();

    this.encoder = new MessageEncoder();
    this.decoder = new MessageDecoder();
    this.connection = new Connection(url);
    this.connection.onConnected = () => this.onConnected();
    this.connection.onDisconnected = (reason, retry) => this.onDisconnected(reason, retry);

    this.connection.onMessage = (rawData) => {
      try {
        this.handleMessage(rawData);
      } catch (error) {
        console.error("Failed to decode websocket message", error);
        const reason = error instanceof Error ? error.message : "Malformed websocket message";
        void this.connection.close();
        this.onDisconnected(reason, true);
      }
    };
  };

  private handleMessage(rawData: ArrayBuffer | string) {
    const data = this.decoder.decode(rawData);

    if (data.type === "me") {
      this.playerId = data.id;
      this.encoder = new MessageEncoder(this.playerId);
    }

    if (data.type == "room") {
      // A full snapshot is a synchronization barrier. Any queued delta was
      // generated against an older snapshot and must not be replayed over it.
      this.processingBuffer = this.processingBuffer.filter(message =>
        !this.isBoardDerivedMessage(message)
      );
      return this.dispatchMessage(data);
    }

    // important messages that shouldn't be buffered
    if (data.type == "version"
      || data.type == "me"
      || data.type == "users"
      || data.type == "ready"
      || data.type === CMD_TYPE.HEARTBEAT)
      return this.dispatchMessage(data);

    if (this.processingMode === "process") {
      this.dispatchMessage(data);
    } else {
      if (this.processingBuffer.length >= 10_000)
        throw new Error("Websocket initialization buffer overflow");
      this.processingBuffer.push(data);
    }
  }

  private dispatchMessage(msg: DecodedWireMessage) {
    this.dispatchEvent(new CustomEvent("message", { detail: msg }));
  }

  private isBoardDerivedMessage(message: DecodedWireMessage) {
    return message.type === "update"
      || message.type === "position_correction"
      || message.type === "cleanup_layout"
      || message.type === "push_groups"
      || message.type === CMD_TYPE.PICK
      || message.type === CMD_TYPE.MOVE
      || message.type === CMD_TYPE.DROP
      || message.type === CMD_TYPE.SELECT
      || message.type === CMD_TYPE.DESELECT
      || message.type === CMD_TYPE.LOCK
      || message.type === CMD_TYPE.UNLOCK
      || message.type === CMD_TYPE.STEAL
      || message.type === CMD_TYPE.MERGE
      || message.type === CMD_TYPE.ROTATE
      || message.type === CMD_TYPE.FLIP
      || message.type === CMD_TYPE.ROT_UPDATE
      || message.type === CMD_TYPE.SET_COMMITTED
      || message.type === CMD_TYPE.UNSET_COMMITTED
      || message.type === CMD_TYPE.NEW_SET;
  }

  changeMode(mode: ProcessingMode) {
    this.processingMode = mode; // need to change mode before, or else buffer messages just get re-buffered
    if (mode === "process" && this.processingBuffer.length > 0) {
      const pending = this.processingBuffer;
      this.processingBuffer = [];
      for (const msg of pending) {
        this.dispatchMessage(msg);
      }
    }
  }

  send(encode: (encoder: MessageEncoder) => Uint8Array | object | undefined) {
    if (this.connection.isConnected()) {
      const msg = encode(this.encoder);
      if (msg) {
        this.connection.send(msg);
      }
    } else {
      // TODO: buffer???
      console.warn("HOLA AMIGOS, NO SE PUEDE ENVIAR MENSAJE SIN CONECTARSE");
    }
  }

  isConnected() {
    return this.connection.isConnected();
  }

  async closeConnection() {
    await this.connection.close();
  }
}
