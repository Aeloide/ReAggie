import type { binaryObj, jsonObj } from "./types";

export enum ROTATION {
    NORTH = 0,
    EAST = 1,
    SOUTH = 2,
    WEST = 3,
}

export enum CMD_TYPE {
    PICK = 0x1,
    MOVE = 0x2,
    DROP = 0x3,
    SELECT = 0x4,
    DESELECT = 0x5,
    MERGE = 0x6,
    ROTATE = 0x7,
    LOCK = 0x8,
    UNLOCK = 0x9,
    STEAL = 0xA,
    FLIP = 15,
    HEARTBEAT = 0xB,
    RECORDSOLVED = 0x40,
    MOVE_KAO = 0x41,
    PICK_KAO = 0x42,
    RELEASE_KAO = 0x43,
    RECORD_UPDATE = 0x60,
    ROT_UPDATE = 0x61,
    SET_COMMITTED = 0x62, // [cmdid, groupid]
    UNSET_COMMITTED = 0x63, // [cmdid]
    SET_KAOS = 0x88,
    EM_PROC = 0xAA,
    NEW_SET = 0xFE,
};

export type DecodedWireMessage = jsonObj | binaryObj;
