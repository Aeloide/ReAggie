import { getReplayUrl } from "$lib";
import { MessageDecoder } from "$room/network/message-decoder";
import type { ReplayLogEvent } from "./types";

export async function fetchRoomReplay(roomId: string, gameCompleted: boolean) {
  const url = getReplayUrl(`${roomId}.jiggie`);
  // disable cache as replay might be updated on the server (if game is not completed)
  const response = await fetch(url, { cache: gameCompleted ? undefined : "no-cache" });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Replay not found.");
    }

    throw new Error("Failed to load replay. Please try again later.");
  }

  if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    throw new Error("Replay not found.");
  }

  let arrayBuffer: ArrayBuffer;

  if (!gameCompleted) {
    arrayBuffer = await response.arrayBuffer();
  } else {
    const decompressionStream = new DecompressionStream("deflate");
    const decompressedStream = response.body!.pipeThrough(decompressionStream);
    arrayBuffer = await new Response(decompressedStream).arrayBuffer();
  }

  const dataView = new DataView(arrayBuffer);

  const logEvents: ReplayLogEvent[] = [];
  const textDecoder = new TextDecoder("utf-8");
  const msgDecoder = new MessageDecoder();

  let offset = 0;
  while (offset < dataView.byteLength) {
    const timestampData = decodeVLQ(dataView, offset);
    if (!timestampData) {
      if (gameCompleted) throw new Error("Replay data is incomplete.");
      break;
    }

    const { value: timestamp, length: timestampLength } = timestampData;
    offset += timestampLength;

    let messageLengthData = decodeVLQ(dataView, offset);
    if (!messageLengthData) {
      if (gameCompleted) throw new Error("Replay data is incomplete.");
      break;
    }
    offset += messageLengthData.length;

    const isString = messageLengthData.value === 0;
    if (isString) {
      messageLengthData = decodeVLQ(dataView, offset);
      if (!messageLengthData) {
        if (gameCompleted) throw new Error("Replay data is incomplete.");
        break;
      }
      offset += messageLengthData.length;
    }

    if (messageLengthData.value > dataView.byteLength - offset) {
      if (gameCompleted) throw new Error("Replay data is incomplete.");
      break;
    }

    const msgBody = arrayBuffer.slice(offset, offset + messageLengthData.value);
    offset += messageLengthData.value;

    const messageContent = isString ? textDecoder.decode(msgBody) : msgBody;
    const decodedMessageContent = msgDecoder.decode(messageContent);
    logEvents.push({ data: decodedMessageContent, time: timestamp });
  }

  return logEvents;
}

export function updateLogEventsAbsoluteTimes(logEvents: ReplayLogEvent[], startTime: number) {
  logEvents.forEach((x) => {
    x.time = startTime + x.time * 1000;
  });
}

function decodeVLQ(buffer: DataView, offset = 0): { value: number; length: number } | undefined {
  const maxVlqBytes = 6;
  let value = 0;
  let multiplier = 1;

  for (let length = 0; length < maxVlqBytes; length++) {
    if (offset + length >= buffer.byteLength) return undefined;

    const byte = buffer.getUint8(offset + length);
    value += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(value)) throw new Error("Invalid replay data.");

    if ((byte & 0x80) === 0) {
      return { value, length: length + 1 };
    }

    multiplier *= 0x80;
  }

  throw new Error("Invalid replay data.");
}
