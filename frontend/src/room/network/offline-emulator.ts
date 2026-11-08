import { getOfflineRoom, saveOfflineRoom, type OfflineRoom } from "$lib/offline/db";
import { CMD_TYPE, type DecodedWireMessage } from "../common";
import { generateSets } from "$lib/create-room/utils";

export class OfflineSocketEmulator {
  private id: string;
  private onMessage: (msg: DecodedWireMessage) => void;
  private roomData!: OfflineRoom;
  private roomDef!: any;

  // Track emulator state locally
  private piecesToGroup: Map<number, any> = new Map(); // globalId -> groupObj
  private groups: Map<number, any> = new Map(); // groupId -> groupObj
  private hiddenBags: { setIndex: number; bag: any }[] = [];
  private layoutOffset: [number, number] = [0, 0];
  private blobUrls: string[] = [];

  constructor(id: string, onMessage: (msg: DecodedWireMessage) => void) {
    this.id = id;
    this.onMessage = onMessage;
  }

  async start() {
    try {
      const data = await getOfflineRoom(this.id);
      if (!data) {
        this.onMessage({ type: "noroom" as any });
        return;
      }
      this.roomData = data;
      this.initRoomState();
    } catch (e) {
      console.error("Offline emulator initialization failed:", e);
      this.onMessage({ type: "noroom" as any });
    }
  }

  private initRoomState() {
    const rSettings = this.roomData.roomSettings;
    const layouts = this.roomData.layouts;
    const media = this.roomData.media || [{
      blob: this.roomData.imageBlob,
      width: this.roomData.imageWidth,
      height: this.roomData.imageHeight,
      name: this.roomData.imageName
    }];
    const blobUrls = media.map(item => URL.createObjectURL(item.blob));
    this.blobUrls = blobUrls;

    // 1. Generate sets
    const dims = layouts.map((_: any, index: number) => [
      media[index]?.width || this.roomData.imageWidth,
      media[index]?.height || this.roomData.imageHeight
    ] as [number, number]);
    const rawSets = generateSets(this.roomData.pieces, layouts.length, dims);

    const sets = rawSets.map((set, sid) => {
      const l = layouts[sid];
      const base = {
        ...set,
        image: blobUrls[sid] || blobUrls[0]
      };
      return l.voronoiConfig ? {
        ...base,
        count: l.voronoiConfig.total,
        seed: l.voronoiConfig.seed,
        sites: l.voronoiConfig.sites
      } : base;
    });

    // 2. Load or initialize groups
    const groupsList: any[] = [];
    this.hiddenBags = [];
    const isRestoredState = !!this.roomData.gameState?.groups;

    if (isRestoredState) {
      // Restore saved game state
      const savedGroups = this.roomData.gameState.groups;
      for (const g of savedGroups) {
        const groupObj = {
          id: g.id,
          ids: [...g.ids],
          indices: [...g.indices],
          set: g.set,
          x: g.x,
          y: g.y,
          rot: g.rot ?? 0,
          f: !!g.f,
          locked: !!g.locked
        };
        this.groups.set(g.id, groupObj);
        for (const p of groupObj.indices) {
          this.piecesToGroup.set(p + this.getSetOffset(g.set), groupObj);
        }
        groupsList.push(groupObj);
      }
      this.hiddenBags = this.roomData.gameState.hiddenBags || [];
    } else {
      // Build initial groups from layouts
      let setOffset = 0;
      for (let sid = 0; sid < layouts.length; sid++) {
        const layout = layouts[sid];
        const set = sets[sid];

        for (const bag of layout.bags) {
          const isHidden = bag.hiddenUntil !== undefined && bag.hiddenUntil !== null;
          if (isHidden) {
            this.hiddenBags.push({ setIndex: sid, bag });
          }

          if (bag.presolved) {
            const indices = [...bag.pieces];
            if (indices.length > 0) {
              const firstPiece = indices[0];
              const positions = indices.map((index: number) => layout.positions[index] || [0, 0]);
              const targetX = (Math.min(...positions.map((position: number[]) => position[0]))
                + Math.max(...positions.map((position: number[]) => position[0]))) / 2;
              const targetY = (Math.min(...positions.map((position: number[]) => position[1]))
                + Math.max(...positions.map((position: number[]) => position[1]))) / 2;
              const x = isHidden ? 0xDEADBABE : targetX;
              const y = isHidden ? 0xDEADBABE : targetY;

              const groupObj = {
                id: firstPiece + setOffset,
                ids: indices.slice(1).map((idx: number) => idx + setOffset),
                indices: indices,
                set: sid,
                x,
                y,
                rot: 0,
                f: false,
                locked: false
              };
              this.groups.set(groupObj.id, groupObj);
              for (const p of indices) {
                this.piecesToGroup.set(p + setOffset, groupObj);
              }
              groupsList.push(groupObj);
            }
          } else {
            for (const p of bag.pieces) {
              const x = isHidden ? 0xDEADBABE : (layout.positions[p]?.[0] ?? 0);
              const y = isHidden ? 0xDEADBABE : (layout.positions[p]?.[1] ?? 0);

              const groupObj = {
                id: p + setOffset,
                ids: [],
                indices: [p],
                set: sid,
                x,
                y,
                rot: rSettings.rotation ? Math.floor(Math.random() * 4) : 0,
                f: rSettings.flipping ? Math.random() >= 0.5 : false,
                locked: false
              };
              this.groups.set(groupObj.id, groupObj);
              this.piecesToGroup.set(p + setOffset, groupObj);
              groupsList.push(groupObj);
            }
          }
        }
        const numPieces = layout.voronoiConfig ? layout.voronoiConfig.total : (set.cols * set.rows);
        setOffset += numPieces;
      }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const group of groupsList) {
      const set = sets[group.set];
      let groupX = group.x;
      let groupY = group.y;
      if (groupX >= 0xDEAD0000 || groupY >= 0xDEAD0000) {
        const positions = group.indices.map((index: number) =>
          layouts[group.set].positions[index] || [0, 0]
        );
        groupX = (Math.min(...positions.map((position: number[]) => position[0]))
          + Math.max(...positions.map((position: number[]) => position[0]))) / 2;
        groupY = (Math.min(...positions.map((position: number[]) => position[1]))
          + Math.max(...positions.map((position: number[]) => position[1]))) / 2;
      }
      const pieceWidth = set.pieceWidth || set.width / set.cols;
      const pieceHeight = set.pieceHeight || set.height / set.rows;
      const cols = group.indices.map((index: number) => index % set.cols);
      const rows = group.indices.map((index: number) => Math.floor(index / set.cols));
      let width = (Math.max(...cols) - Math.min(...cols) + 1) * pieceWidth;
      let height = (Math.max(...rows) - Math.min(...rows) + 1) * pieceHeight;
      if (group.rot === 1 || group.rot === 3)
        [width, height] = [height, width];
      minX = Math.min(minX, groupX - width / 2);
      minY = Math.min(minY, groupY - height / 2);
      maxX = Math.max(maxX, groupX + width / 2);
      maxY = Math.max(maxY, groupY + height / 2);
    }
    if (!Number.isFinite(minX)) {
      minX = minY = 0;
      maxX = Math.max(...sets.map(set => set.width), 1);
      maxY = Math.max(...sets.map(set => set.height), 1);
    }
    this.layoutOffset = isRestoredState
      ? (this.roomData.gameState?.layoutOffset || [0, 0])
      : [500 - minX, 500 - minY];
    if (!isRestoredState) {
      for (const group of groupsList) {
        if (group.x < 0xDEAD0000 && group.y < 0xDEAD0000) {
          group.x += this.layoutOffset[0];
          group.y += this.layoutOffset[1];
        }
      }
    }

    // 3. Construct Room definition
    this.roomDef = {
      boardWidth: this.roomData.gameState?.boardWidth
        || (isRestoredState ? Math.max(1000, maxX + 500) : maxX - minX + 1000),
      boardHeight: this.roomData.gameState?.boardHeight
        || (isRestoredState ? Math.max(1000, maxY + 500) : maxY - minY + 1000),
      startTime: this.roomData.gameState?.startTime,
      endTime: this.roomData.gameState?.endTime,
      groups: groupsList,
      hidePreview: rSettings.preview,
      votekick: false,
      jitter: rSettings.jitter,
      cornerJitter: rSettings.cornerJitter,
      name: this.roomData.name,
      nolockunlock: rSettings.lockMode === false,
      nomultiselect: rSettings.multiselect === false,
      pieces: this.roomData.pieces,
      rotation: rSettings.rotation,
      flipping: rSettings.flipping,
      seed: rSettings.seed,
      sets: sets,
      tabSize: rSettings.tabSize,
      thumb: "",
      square: rSettings.shape === "squares",
      ext: {
        layouts,
        hiddenBags: this.hiddenBags
      }
    };

    // Dispatch messages to initialize frontend
    this.onMessage({ type: "me" as any, id: 1 } as any);
    this.onMessage({
      type: "users" as any,
      users: [{
        id: 1,
        name: "Solo Player",
        color: "#2cf7d5",
        ping: 0,
        device: "desktop",
        spectator: false
      }]
    } as any);

    this.onMessage({ type: "room" as any, room: this.roomDef } as any);
  }

  stop() {
    this.blobUrls.forEach(url => URL.revokeObjectURL(url));
    this.blobUrls = [];
  }

  handleClientMessage(msg: any) {
    if (!msg) return;

    // Support object wire format as well as action handlers
    switch (msg.type) {
      case "pick":
        if (!this.roomDef.startTime) {
          this.roomDef.startTime = Date.now();
          this.onMessage({ type: "update" as any, room: { startTime: this.roomDef.startTime } } as any);
        }
        break;

      case "move":
        if (msg.groups) {
          for (const wireGroup of msg.groups) {
            const group = this.groups.get(wireGroup.id);
            if (group) {
              group.x = wireGroup.x;
              group.y = wireGroup.y;
            }
          }
        }
        break;

      case "moveDelta":
        if (msg.groups) {
          for (const wg of msg.groups) {
            const g = this.groups.get(wg.id);
            if (g) {
              g.x += msg.dx;
              g.y += msg.dy;
            }
          }
        }
        break;

      case "drop":
        if (msg.groups) {
          for (const wg of msg.groups) {
            const g = this.groups.get(wg.id);
            if (g) {
              g.x = wg.x;
              g.y = wg.y;
            }
          }
          this.saveProgress();
        }
        break;

      case "rotate":
        if (msg.rotations) {
          for (const r of msg.rotations) {
            const g = this.groups.get(r.id);
            if (g) {
              g.rot = r.rotation;
            }
          }
          this.saveProgress();
        }
        break;

      case "flip":
        if (msg.flips) {
          for (const flip of msg.flips) {
            const group = this.groups.get(flip.id);
            if (group) group.f = !!flip.f;
          }
          this.saveProgress();
        }
        break;

      case "lock":
      case "unlock":
        if (msg.groups) {
          const locked = msg.type === "lock";
          for (const wireGroup of msg.groups) {
            const group = this.groups.get(wireGroup.id);
            if (group) group.locked = locked;
          }
          this.saveProgress();
        }
        break;

      case "merge":
        const { groupIdA, groupIdB, x, y } = msg;
        const gA = this.groups.get(groupIdA);
        const gB = this.groups.get(groupIdB);

        if (gA && gB && gA !== gB) {
          const oldAId = gA.id;
          const oldBId = gB.id;
          gB.x = x;
          gB.y = y;
          gB.indices.push(...gA.indices);
          gB.ids.push(...gA.ids, ...gB.ids, Math.min(oldAId, oldBId));
          gB.ids = [...new Set(gB.ids.filter((id: number) => id !== Math.max(oldAId, oldBId)))];
          gB.id = Math.max(oldAId, oldBId);

          // Update pieces mapping
          for (const p of gA.indices) {
            this.piecesToGroup.set(p + this.getSetOffset(gA.set), gB);
          }

          this.groups.delete(oldAId);
          this.groups.delete(oldBId);
          this.groups.set(gB.id, gB);

          if (this.groups.size === this.roomDef.sets.length && !this.roomDef.endTime) {
            this.roomDef.endTime = Date.now();
            this.onMessage({ type: "update" as any, room: { endTime: this.roomDef.endTime } } as any);
          }

          // Trigger bag completion checks
          this.checkBagsCompleted();
          this.saveProgress();
        }
        break;
    }
  }

  private getSetOffset(setIndex: number): number {
    let offset = 0;
    const layouts = this.roomData.layouts;
    for (let i = 0; i < setIndex; i++) {
      const lay = layouts[i];
      const s = this.roomDef.sets[i];
      const numPieces = lay.voronoiConfig ? lay.voronoiConfig.total : (s.cols * s.rows);
      offset += numPieces;
    }
    return offset;
  }

  private isBagResolved(setIndex: number, bagId: number): boolean {
    const layout = this.roomData.layouts[setIndex];
    if (!layout) return false;
    const bag = layout.bags.find((b: any) => b.id === bagId);
    if (!bag) return false;

    if (bag.pieces.length === 0) return true;

    const setOffset = this.getSetOffset(setIndex);
    const firstGlobalId = bag.pieces[0] + setOffset;
    const firstGroup = this.piecesToGroup.get(firstGlobalId);
    if (!firstGroup || firstGroup.x >= 0xDEAD0000 || firstGroup.y >= 0xDEAD0000) return false;

    for (let j = 1; j < bag.pieces.length; j++) {
      const globalId = bag.pieces[j] + setOffset;
      const g = this.piecesToGroup.get(globalId);
      if (!g || g !== firstGroup) {
        return false;
      }
    }
    return true;
  }

  private checkBagsCompleted() {
    let spawnedAny = true;
    let anySpawnedAtAll = false;

    while (spawnedAny) {
      spawnedAny = false;
      const remainingHiddenBags: { setIndex: number; bag: any }[] = [];

      for (const item of this.hiddenBags) {
        const parentResolved = this.isBagResolved(item.setIndex, item.bag.hiddenUntil);
        if (parentResolved) {
          this.spawnBag(item.setIndex, item.bag);
          spawnedAny = true;
          anySpawnedAtAll = true;
        } else {
          remainingHiddenBags.push(item);
        }
      }

      if (spawnedAny) {
        this.hiddenBags = remainingHiddenBags;
        this.roomDef.ext.hiddenBags = this.hiddenBags;
      }
    }

    if (anySpawnedAtAll) {
      this.onMessage({ type: "update" as any, room: { ext: { hiddenBags: this.hiddenBags } } } as any);
    }
  }

  private spawnBag(setIndex: number, bag: any) {
    const setOffset = this.getSetOffset(setIndex);
    const layout = this.roomData.layouts[setIndex];
    const itemsToMove: { id: number; x: number; y: number }[] = [];

    if (bag.presolved) {
      const indices = [...bag.pieces];
      if (indices.length > 0) {
        const firstPiece = indices[0];
        const positions = indices.map((index: number) => layout.positions?.[index] || [0, 0]);
        const pos = [
          (Math.min(...positions.map((position: number[]) => position[0]))
            + Math.max(...positions.map((position: number[]) => position[0]))) / 2,
          (Math.min(...positions.map((position: number[]) => position[1]))
            + Math.max(...positions.map((position: number[]) => position[1]))) / 2
        ];
        const g = this.piecesToGroup.get(firstPiece + setOffset);
        if (g) {
          g.x = pos[0] + this.layoutOffset[0];
          g.y = pos[1] + this.layoutOffset[1];
          itemsToMove.push({ id: g.id, x: g.x, y: g.y });
        }
      }
    } else {
      for (const p of bag.pieces) {
        const pos = layout.positions ? layout.positions[p] : [0, 0];
        const g = this.piecesToGroup.get(p + setOffset);
        if (g) {
          g.x = pos[0] + this.layoutOffset[0];
          g.y = pos[1] + this.layoutOffset[1];
          itemsToMove.push({ id: g.id, x: g.x, y: g.y });
        }
      }
    }

    if (itemsToMove.length > 0) {
      // Echo drop update to client to place pieces at proper positions
      this.onMessage({ type: CMD_TYPE.DROP as any, userId: 1, groups: itemsToMove } as any);
    }
  }

  private async saveProgress() {
    const groupsList = Array.from(this.groups.values());
    const totalPieces = this.roomDef.sets.reduce((total: number, set: any) =>
      total + (set.count || set.cols * set.rows), 0);
    const currentGroupsCount = this.groups.size;
    const targetGroups = this.roomDef.sets.length;
    const requiredMerges = totalPieces - targetGroups;
    const completion = requiredMerges > 0
      ? Math.max(0, Math.min(1, (totalPieces - currentGroupsCount) / requiredMerges))
      : 1.0;

    this.roomData.gameState = {
      groups: groupsList,
      hiddenBags: this.hiddenBags,
      completion,
      startTime: this.roomDef.startTime,
      endTime: this.roomDef.endTime,
      layoutOffset: this.layoutOffset,
      boardWidth: this.roomDef.boardWidth,
      boardHeight: this.roomDef.boardHeight
    };

    try {
      await saveOfflineRoom(this.roomData);
    } catch (e) {
      console.error("Failed to save progress to IndexedDB:", e);
    }
  }
}
