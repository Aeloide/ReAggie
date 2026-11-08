import { Transform, TransformCallback } from "stream";
import fs from "fs";
import zlib from "zlib";

export class ReplayWriter {
  private replayFileStream: fs.WriteStream;
  private msgReduceTransform: MessageReduceTransform;
  private msgToReplayTransform: MessageToReplayTransform;
  private closed = false;

  constructor(private filePath: string, startTime?: number) {
    this.replayFileStream = fs.createWriteStream(filePath, { flags: "a" });

    this.msgReduceTransform = new MessageReduceTransform();
    this.msgToReplayTransform = new MessageToReplayTransform(startTime);

    this.msgReduceTransform
      .pipe(this.msgToReplayTransform)
      .pipe(this.replayFileStream);

    this.msgReduceTransform.on("error", console.error);
    this.msgToReplayTransform.on("error", console.error);
    this.replayFileStream.on("error", console.error);
  }

  setStartTime(startTime: number) {
    this.msgToReplayTransform.setStartTime(startTime);
  }

  write(message: Buffer | string) {
    this.msgReduceTransform.write(message);
  }

  endAndCompress() {
    this.end(() => {
      const compressedFilePath = this.filePath + ".gz";

      const deflate = zlib.createDeflate();
      const readStream = fs.createReadStream(this.filePath);
      const writeStream = fs.createWriteStream(compressedFilePath);

      readStream
        .pipe(deflate)
        .pipe(writeStream)
        .on("finish", () => {
          // replace the original file with the compressed one
          fs.rename(compressedFilePath, this.filePath, (err) => {
            if (err) {
              console.error(
                "Error renaming the replay file",
                compressedFilePath,
                this.filePath,
                err
              );
            }
          });
        })
        .on("error", (err) => {
          console.error("Error during compression", this.filePath, err);
        });
    });
  }

  end(cb?: () => void) {
    if (this.closed) {
      cb?.();
      return;
    }

    this.msgReduceTransform.end(() => {
      this.msgToReplayTransform.end(() => {
        this.replayFileStream.end(() => {
          this.closed = true;
          cb?.();
        });
      });
    });
  }
}

const encodeVLQ = (() => {
  const MAX_VLQ_BYTES = 6;
  const buffer = new Uint8Array(MAX_VLQ_BYTES);

  return (value: number) => {
    let index = 0;

    do {
      let byte = value & 0x7f;
      value >>>= 7; // unsigned shift
      if (value !== 0) {
        byte |= 0x80;
      }
      buffer[index++] = byte;
    } while (value !== 0);

    return Buffer.from(buffer.subarray(0, index));
  };
})();

class MessageToReplayTransform extends Transform {
  private startTimeSeconds?: number;

  constructor(startTime?: number) {
    super({ objectMode: true });

    this.setStartTime(startTime);
  }

  setStartTime(time?: number) {
    if (time) {
      this.startTimeSeconds = ~~(time / 1_000);
    }
  }

  private getTimeDiffSeconds() {
    if (!this.startTimeSeconds) {
      return 0;
    }

    const nowSeconds = ~~(Date.now() / 1_000);
    return nowSeconds - this.startTimeSeconds;
  }

  override _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: TransformCallback
  ) {
    const chunkLength = Buffer.byteLength(chunk);
    const lengthBuffer = encodeVLQ(chunkLength);
    const timeBuffer = encodeVLQ(this.getTimeDiffSeconds());

    let offset = 0;
    let buffer: Buffer;
    if (typeof chunk === "string") {
      buffer = Buffer.allocUnsafe(
        timeBuffer.length + 1 + lengthBuffer.length + chunkLength
      );

      timeBuffer.copy(buffer, offset);
      offset += timeBuffer.length;

      // 0x00 (chunkLength) is a string indicator
      buffer.writeUint8(0x00, offset);
      offset += 1;

      lengthBuffer.copy(buffer, offset);
      offset += lengthBuffer.length;

      buffer.write(chunk, offset, chunkLength);
      offset += chunkLength;
    } else if (Buffer.isBuffer(chunk)) {
      buffer = Buffer.allocUnsafe(
        timeBuffer.length + lengthBuffer.length + chunkLength
      );

      timeBuffer.copy(buffer, offset);
      offset += timeBuffer.length;

      lengthBuffer.copy(buffer, offset);
      offset += lengthBuffer.length;

      chunk.copy(buffer, offset);
      offset += chunkLength;
    } else {
      callback(Error("Unsupported message type"));
      return;
    }

    this.push(buffer);
    callback();
  }
}

class MessageReduceTransform extends Transform {
  private lastMoveMsgPerUser: Map<
    number,
    {
      chunk: Buffer;
      userId: number;
      groupsLength: number;
    }
  > = new Map();

  constructor() {
    super({ objectMode: true });
  }

  private flushMoveEvents() {
    if (this.lastMoveMsgPerUser.size > 0) {
      this.lastMoveMsgPerUser.forEach((lastMove) => {
        this.push(lastMove.chunk);
      });
      this.lastMoveMsgPerUser.clear();
    }
  }

  override _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: TransformCallback
  ) {
    const CMD_TYPE_MOVE = 0x2;
    if (typeof chunk !== "string" && chunk.readUint8(0) === CMD_TYPE_MOVE) {
      const userId = chunk.readUint16LE(1);
      const groupsLength = Math.floor((chunk.byteLength - 3) / 10);

      const lastMove = this.lastMoveMsgPerUser.get(userId);
      const chunkCopy = Buffer.from(chunk);
      if (lastMove) {
        // it is safe to compare only the groupsLength, as other event types will flush the lastMove events
        if (lastMove.groupsLength === groupsLength) {
          this.lastMoveMsgPerUser.set(userId, { chunk: chunkCopy, userId, groupsLength });
        } else {
          // it is a spread command diff (some selected groups were not moved) => flush the last move event
          this.push(lastMove.chunk);
          this.lastMoveMsgPerUser.set(userId, { chunk: chunkCopy, userId, groupsLength });
        }
      } else {
        // first event for this user
        this.lastMoveMsgPerUser.set(userId, { chunk: chunkCopy, userId, groupsLength });
      }
    } else {
      this.flushMoveEvents();
      this.push(chunk);
    }

    callback();
  }

  override _flush(callback: TransformCallback) {
    this.flushMoveEvents();
    callback();
  }
}
