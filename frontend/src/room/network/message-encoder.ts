import type { Permission } from "$lib/room/permissions";
import { CMD_TYPE } from "$room/common";
import type { WireGroup } from "$room/types";

export class MessageEncoder {
  private tmpbuffer = new Uint8Array(1024);
  private tmpbufferview = new DataView(this.tmpbuffer.buffer);

  constructor(private playerId?: number) { }

  private allocateCommandBuffer(cmdType: CMD_TYPE, initialSize: number) {
    if (!this.playerId) {
      throw new Error(`Cannot send binary message ([${CMD_TYPE[cmdType]}]) without player id!`);
    }

    while (initialSize > this.tmpbuffer.byteLength) {
      this.tmpbuffer = new Uint8Array(2 * this.tmpbuffer.byteLength);
      this.tmpbufferview = new DataView(this.tmpbuffer.buffer);
    }

    this.tmpbufferview.setUint8(0, cmdType);
    this.tmpbufferview.setUint16(1, this.playerId, true);
  }

  private sendGroupAction(cmd: CMD_TYPE.SELECT | CMD_TYPE.DESELECT | CMD_TYPE.LOCK | CMD_TYPE.UNLOCK | CMD_TYPE.STEAL, groups: WireGroup[]) {
    if (import.meta.env.DEV && !groups.length) throw new Error(`Tried to send an empty ${CMD_TYPE[cmd]}-group!`);
    const size = 3 + 2 * groups.length;
    this.allocateCommandBuffer(cmd, size);
    for (let i = 0, offset = 3; i < groups.length; i++, offset += 2) {
      this.tmpbufferview.setUint16(offset, groups[i].id, true);
    }
    return this.tmpbuffer.subarray(0, size);
  }

  private sendGroupPositions(cmd: CMD_TYPE.PICK | CMD_TYPE.MOVE | CMD_TYPE.DROP, groups: WireGroup[]) {
    if (!groups.length) {
      return;
    }

    if (import.meta.env.DEV && !groups.length) throw new Error(`Tried to send an empty ${CMD_TYPE[cmd]}-group!`);
    const bytes = 3 + 10 * groups.length;
    this.allocateCommandBuffer(cmd, bytes);
    for (let n = 0, a = 3; n < groups.length; n++, a += 10) {
      this.tmpbufferview.setUint16(a, groups[n].id, true);
      this.tmpbufferview.setFloat32(a + 2, groups[n].x, true);
      this.tmpbufferview.setFloat32(a + 6, groups[n].y, true);
    }
    return this.tmpbuffer.subarray(0, bytes);
  }

  pick(groups: WireGroup[]) {
    return this.sendGroupPositions(CMD_TYPE.PICK, groups);
  }

  move(groups: WireGroup[]) {
    return this.sendGroupPositions(CMD_TYPE.MOVE, groups);
  }

  drop(groups: WireGroup[]) {
    return this.sendGroupPositions(CMD_TYPE.DROP, groups);
  }

  select(groups: WireGroup[]) {
    return this.sendGroupAction(CMD_TYPE.SELECT, groups);
  }

  deselect(groups: WireGroup[]) {
    return this.sendGroupAction(CMD_TYPE.DESELECT, groups);
  }

  lock(groups: WireGroup[]) {
    return this.sendGroupAction(CMD_TYPE.LOCK, groups);
  }

  unlock(groups: WireGroup[]) {
    return this.sendGroupAction(CMD_TYPE.UNLOCK, groups);
  }

  forceDrop(groups: WireGroup[]) {
    return this.sendGroupAction(CMD_TYPE.STEAL, groups);
  }

  sendKaoPosition(id: number, x: number, y: number) {
    const bytes = 10;
    this.allocateCommandBuffer(CMD_TYPE.MOVE_KAO, bytes);
    this.tmpbufferview.setUint8(1, id);
    this.tmpbufferview.setFloat32(2, x, true);
    this.tmpbufferview.setFloat32(6, y, true);
    return this.tmpbuffer.subarray(0, bytes);
  }

  pickKao(id: number) {
    const bytes = 3;
    this.allocateCommandBuffer(CMD_TYPE.PICK_KAO, bytes);
    this.tmpbufferview.setUint16(1, id, true);
    return this.tmpbuffer.subarray(0, bytes);
  }

  releaseKao(id: number) {
    const bytes = 3;
    this.allocateCommandBuffer(CMD_TYPE.RELEASE_KAO, bytes);
    this.tmpbufferview.setUint16(1, id, true);
    return this.tmpbuffer.subarray(0, bytes);
  }

  setJc(id: number, x: number, y: number, smd: 0 | 1 | 2) {
    const bytes = 11;
    this.allocateCommandBuffer(0xAB + smd, bytes);
    this.tmpbufferview.setUint16(1, id, true);
    this.tmpbufferview.setFloat32(3, x, true);
    this.tmpbufferview.setFloat32(7, y, true);
    return this.tmpbuffer.subarray(0, bytes);
  }

  patJc(id: number, patting: boolean) {
    const bytes = 3;
    this.allocateCommandBuffer(0xAE + +patting, bytes);
    this.tmpbufferview.setUint16(1, id, true);
    return this.tmpbuffer.subarray(0, bytes);
  }

  solveRecord(discId: number) {
    const cmd = CMD_TYPE.RECORDSOLVED;
    this.allocateCommandBuffer(cmd, 5); // 1: cmdid, 2-3: player id, 4-5: record id
    this.tmpbufferview.setUint16(3, discId, true);
    return this.tmpbuffer.subarray(0, 5);
  }

  kick(userId: number, secret: string) {
    return {
      type: "kick",
      user: userId,
      secret: secret,
    };
  }

  votekick(userId: number) {
    return {
      type: "votekickid",
      user: userId,
    };
  }

  promote(id: number, caps: Permission[]) {
    return {
      type: "delegateid",
      caps: caps.join(','),
      id
    };
  }

  muteuser(id: number, arg: { type: 'asn'; } | { type: 'ip', range: 'exact' | 'narrow' | 'large'; }) {
    return {
      type: 'muteid',
      id,
      ftype: arg.type,
      range: 'range' in arg ? arg.range : ''
    };
  }

  unkickAll(secret: string) {
    return {
      type: "unkickall",
      secret: secret,
    };
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
    return {
      type: "options",
      secret: secret,
      hidePreview: hidePreview,
      votekick: votekick,
      nomultiselect: noMultiSelect,
      nolockunlock: noLockUnlock,
      norectselect: noBoxSelect,
      nostack: noStack,
      jigchan
    };
  }
  chat(message: string) {
    return {
      type: "chat",
      message: message,
    };
  }

  emote(emotes: string[]) {
    return {
      type: "emote",
      emotes,
    };
  }

  /** CMD_TYPE 7 */
  turn(groups: (WireGroup & { rot?: number; })[]) {
    const cmd = CMD_TYPE.ROTATE;
    if (import.meta.env.DEV && !groups.length) throw new Error(`Tried to send an empty ${CMD_TYPE[cmd]}-group!`);
    const bytes = 3 + 3 * groups.length;
    this.allocateCommandBuffer(cmd, bytes);
    for (let i = 0, offset = 3; i < groups.length; i++, offset += 3) {
      this.tmpbufferview.setUint16(offset, groups[i].id, true);
      this.tmpbufferview.setUint8(offset + 2, groups[i].rot!);
    }
    return this.tmpbuffer.subarray(0, bytes);
  }

  flip(groups: (WireGroup & { f?: boolean })[]) {
    const cmd = CMD_TYPE.FLIP;
    if (import.meta.env.DEV && !groups.length) throw new Error(`Tried to send an empty ${CMD_TYPE[cmd]}-group!`);
    const bytes = 3 + 3 * groups.length;
    this.allocateCommandBuffer(cmd, bytes);
    for (let i = 0, offset = 3; i < groups.length; i++, offset += 3) {
      this.tmpbufferview.setUint16(offset, groups[i].id, true);
      this.tmpbufferview.setUint8(offset + 2, groups[i].f ? 1 : 0);
    }
    return this.tmpbuffer.subarray(0, bytes);
  }

  /** CMD_TYPE 6 */
  merge(groupIdA: number, groupIdB: number, x: number, y: number) {
    const cmd = CMD_TYPE.MERGE;
    const bytes = 15;
    this.allocateCommandBuffer(cmd, bytes);
    this.tmpbufferview.setUint16(3, groupIdA, true);
    this.tmpbufferview.setUint16(5, groupIdB, true);
    this.tmpbufferview.setFloat32(7, x, true);
    this.tmpbufferview.setFloat32(11, y, true);
    return this.tmpbuffer.subarray(0, bytes);
  }

  heartbeat() {
    this.allocateCommandBuffer(CMD_TYPE.HEARTBEAT, 11);
    this.tmpbufferview.setFloat64(3, Date.now(), true);
    return this.tmpbuffer.subarray(0, 11);
  }

  setVisibility() {
    return {
      type: "visibility",
      value: document.visibilityState == "visible",
    };
  }

  user(name: string, color: string, room: string, secret?: string, lastChatMessageTimestamp?: number, selected_token?: string, bingoToken?: string) {
    return {
      type: "user",
      name,
      color,
      room,
      secret,
      token: selected_token,
      ts: lastChatMessageTimestamp,
      bingoToken, // Add support for bingoToken
    };
  }

  updateToken(token: string) {
    return {
      type: "token",
      token
    };
  }

  updatePushSub(sub: PushSubscriptionJSON) {
    return {
      type: "sub",
      sub
    };
  }
}
