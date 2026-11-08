import type { DecodedWireMessage, ROTATION } from "../common";
import { CMD_TYPE } from "../common";
import type { JukeRecord, WireGroup, binaryObj, jsonObj } from "../types";

export class MessageDecoder {
  decode(data: ArrayBuffer | string): DecodedWireMessage {
    try {
      if ("string" == typeof data) {
        return this.parseJSON(data);
      }

      return this.decodeBinary(data);
    } catch (e) {
      console.error("Failed to handle the message", e, data);
      throw e;
    }
  }

  private parseJSON(data: string) {
    const jsonData = JSON.parse(data);
    if (jsonData.error) {
      throw new Error(jsonData.error);
    }

    return jsonData as jsonObj;
  }

  // TODO: it shouldn't be assumed only one message can appear in a buffer, for commands with fixed size
  private decodeBinary(data: ArrayBuffer): binaryObj {
    const dataView = new DataView(data);
    const type = dataView.getUint8(0) as CMD_TYPE;
    let userId;
    switch (type) {
      case CMD_TYPE.PICK:
      case CMD_TYPE.MOVE:
      case CMD_TYPE.DROP:
        userId = dataView.getUint16(1, true);
        const groups: WireGroup[] = [];
        for (let ptr = 3; ptr < data.byteLength; ptr = ptr + 10) {
          groups.push({
            id: dataView.getUint16(ptr, true),
            x: dataView.getFloat32(ptr + 2, true),
            y: dataView.getFloat32(ptr + 6, true),
          });
        }
        return { type, userId, groups };
      case CMD_TYPE.SELECT:
      case CMD_TYPE.DESELECT:
      case CMD_TYPE.LOCK:
      case CMD_TYPE.UNLOCK:
      case CMD_TYPE.STEAL:
        userId = dataView.getUint16(1, true);
        const groupIds: number[] = [];
        for (let ptr = 3; ptr < data.byteLength; ptr = ptr + 2) {
          groupIds.push(dataView.getUint16(ptr, true));
        }
        return { type, userId, groupIds };
      case CMD_TYPE.MERGE:
        userId = dataView.getUint16(1, true);
        const groupIdA = dataView.getUint16(3, true);
        const groupIdB = dataView.getUint16(5, true);
        const x = dataView.getFloat32(7, true);
        const y = dataView.getFloat32(11, true);
        return { type, userId, groupIdA, groupIdB, x, y };
      case CMD_TYPE.ROTATE:
        userId = dataView.getUint16(1, true);
        const rotations: { id: number; rotation: ROTATION }[] = [];
        for (let ptr = 3; ptr < dataView.byteLength; ptr += 3) {
          rotations.push({
            id: dataView.getUint16(ptr, true),
            rotation: dataView.getUint8(ptr + 2) as ROTATION,
          });
        }
        return { type, userId, rotations };
      case CMD_TYPE.FLIP:
        userId = dataView.getUint16(1, true);
        const flips: { id: number; f: boolean }[] = [];
        for (let ptr = 3; ptr < dataView.byteLength; ptr += 3) {
          flips.push({
            id: dataView.getUint16(ptr, true),
            f: dataView.getUint8(ptr + 2) === 1,
          });
        }
        return { type, userId, flips };
      case CMD_TYPE.RECORD_UPDATE:
        userId = dataView.getUint16(1, true);
        const records: JukeRecord[] = [];
        for (let offset = 3; offset < data.byteLength; offset += 6) {
          records.push({
            id: dataView.getUint16(offset, true),
            pos: [dataView.getUint16(offset + 2, true), dataView.getUint16(offset + 4, true)],
          });
        }
        return { type, userId, records };
      case CMD_TYPE.HEARTBEAT: {
        userId = dataView.getUint16(1, true);
        let drift: number | undefined;
        if (data.byteLength >= 11) {
          drift = dataView.getFloat64(3, true);
        }
        return { type, userId, drift };
      }
      case CMD_TYPE.ROT_UPDATE: {
        const groups: [number, number][] = [];
        for (let ptr = 1; ptr < data.byteLength; ptr += 10) {
          const id = dataView.getUint16(ptr, true);
          const ts = dataView.getFloat64(ptr + 2, true);
          groups.push([id, ts]);
        }
        return { type, groupIdsWithTimestamps: groups };
      }
      case CMD_TYPE.SET_COMMITTED: {
        const groupIds: number[] = [];
        for (let ptr = 1; ptr < data.byteLength; ptr += 2) {
          const id = dataView.getUint16(ptr, true);
          groupIds.push(id);
        }
        return { type, groupIds };
      }
      case CMD_TYPE.UNSET_COMMITTED: {
        const groupId = dataView.getUint16(1, true);
        return { type, groupId };
      }
      case CMD_TYPE.MOVE_KAO: {
        const id = dataView.getUint8(1);
        const x = dataView.getFloat32(2, true);
        const y = dataView.getFloat32(6, true);
        return { type, id, x, y };
      }
      case CMD_TYPE.PICK_KAO: {
        const id = dataView.getUint8(1);
        return { type, id };
      }
      case CMD_TYPE.RELEASE_KAO: {
        const id = dataView.getUint8(1);
        return { type, id };
      }
      case CMD_TYPE.SET_KAOS: {
        let kaos: [number, number][] = [];
        let ptr = 1;
        while (ptr < data.byteLength) {
          const x = dataView.getFloat32(ptr, true);
          const y = dataView.getFloat32(ptr + 4, true);
          kaos.push([x, y]);
          ptr += 8;
        }
        return { type, kaos };
      }
      case CMD_TYPE.EM_PROC: {
        return { type, payload: dataView };
      }
      case CMD_TYPE.NEW_SET: {
        const { new_board, set, groups } = JSON.parse(new TextDecoder().decode(data.slice(1)));
        return { type, new_board, set, groups };
      }
      default:
        throw new Error(`Not supported binary message: ${type}`);
    }
  }
}
