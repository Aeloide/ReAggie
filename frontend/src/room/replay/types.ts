import type { DecodedWireMessage } from "$room/common";

export type ReplayLogEvent = {
  data: DecodedWireMessage;
  time: number;
};
