import { Group, Room, RoomRuntimeState, RoomState, UserPrivate } from "../../types.js";
import { clamp } from "../../utils.js";
import potpack from "../potpack.js";
import munkres from "munkres";
import { Random } from "../../random.js";

const idealDistance = 1.55;

export function getPieceSize(set: Room['sets'][0]) {
    return {
        w: set.pieceWidth || ((set.width || 0) / set.cols),
        h: set.pieceHeight || ((set.height || 0) / set.rows)
    };
}

export function getMaxPieceSize(room: Room) {
    let maxW = 0, maxH = 0;
    for (const set of room.sets) {
        const { w, h } = getPieceSize(set);
        if (w) maxW = Math.max(maxW, w);
        if (h) maxH = Math.max(maxH, h);
    }
    return { maxPieceWidth: maxW, maxPieceHeight: maxH };
}

export function getGroupSize(group: Group, room: Room) {
    const set = room.sets[group.set];
    if (set.sites?.length) {
        const scaleX = set.width / set.imageWidth;
        const scaleY = set.height / set.imageHeight;
        const sites = group.indices
            .map(index => set.sites?.[index])
            .filter((site): site is [number, number] => !!site)
            .map(site => ({ x: site[0] * scaleX, y: site[1] * scaleY }));
        if (sites.length === 0) return { w: 1, h: 1 };
        const approximateDiameter = Math.sqrt((set.width * set.height) / set.sites.length) * 2;
        return {
            w: Math.max(...sites.map(site => site.x)) - Math.min(...sites.map(site => site.x)) + approximateDiameter,
            h: Math.max(...sites.map(site => site.y)) - Math.min(...sites.map(site => site.y)) + approximateDiameter
        };
    }
    const { w: pw, h: ph } = getPieceSize(set);
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    if (group.indices.length === 0) return { w: pw, h: ph };
    for (const idx of group.indices) {
        const c = idx % set.cols;
        const r = Math.floor(idx / set.cols);
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
    }
    return {
        w: (maxC - minC + 1) * pw,
        h: (maxR - minR + 1) * ph
    };
}

export function getGroupPiecesAbsolute(group: Group, room: Room) {
    const set = room.sets[group.set];
    const { w: pw, h: ph } = getPieceSize(set);
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const idx of group.indices) {
        const c = idx % set.cols;
        const r = Math.floor(idx / set.cols);
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
    }
    if (minC === Infinity) return [];

    const pieces = [];
    const grpWidth = (maxC - minC + 1) * pw;
    const grpHeight = (maxR - minR + 1) * ph;

    for (const idx of group.indices) {
        const c = idx % set.cols;
        const r = Math.floor(idx / set.cols);

        const localX = (c - minC) * pw - grpWidth / 2 + pw / 2;
        const localY = (r - minR) * ph - grpHeight / 2 + ph / 2;

        // Approximate for unrotated pieces
        pieces.push({ x: group.x + localX, y: group.y + localY });
    }
    return pieces;
}

function moveGroup(group: Group, targetPoint: { x: number, y: number }, speed: number) {
    const dx = targetPoint.x - group.x;
    const dy = targetPoint.y - group.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return false;

    if (dist < speed) {
        group.x = targetPoint.x;
        group.y = targetPoint.y;
    } else {
        group.x += (dx / dist) * speed;
        group.y += (dy / dist) * speed;
    }
    return true;
}

function preventMovementOOB(group: Group, room: Room) {
    const { w, h } = getGroupSize(group, room);
    const turned = 1 === group.rot || 3 === group.rot;
    const gw = turned ? h : w;
    const gh = turned ? w : h;
    group.x = clamp(gw / 2, group.x, room.boardWidth - gw / 2);
    group.y = clamp(gh / 2, group.y, room.boardHeight - gh / 2);
}


export function arrangePiecesMoveDelta(payload: any, raw: Buffer, user: UserPrivate, room: Room, state: RoomState, runtime: RoomRuntimeState) {
    const dx = payload.dx;
    const dy = payload.dy;
    const gids = payload.gids;

    for (const gid of gids) {
        const group = runtime.transformedgroups.get(gid);
        if (!group) continue;
        if (group.dragStartX !== undefined && group.dragStartY !== undefined) {
            group.x = group.dragStartX + dx;
            group.y = group.dragStartY + dy;
            preventMovementOOB(group, room);
        }
    }
    runtime.broadcaster.broadcast(raw, user.user.id, true);
}

export function arrangePiecesOrder(payload: any, raw: Buffer, user: UserPrivate, room: Room, state: RoomState, runtime: RoomRuntimeState) {
    const { maxPieceWidth, maxPieceHeight } = getMaxPieceSize(room);
    const cellSize = Math.max(maxPieceWidth, maxPieceHeight) * idealDistance;
    const speed = (maxPieceWidth + maxPieceHeight) / 4;

    const selection: Group[] = [];
    for (const g of runtime.transformedgroups.values()) {
        if (g.selected === user.user.id || g.dragged === user.user.id) {
            selection.push(g);
        }
    }
    if (selection.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const group of selection) {
        const { w, h } = getGroupSize(group, room);
        minX = Math.min(minX, group.x - w / 2);
        minY = Math.min(minY, group.y - h / 2);
        maxX = Math.max(maxX, group.x + w / 2);
        maxY = Math.max(maxY, group.y + h / 2);
    }

    const pieces = selection.flatMap(g => getGroupPiecesAbsolute(g, room));
    let sumX = 0, sumY = 0;
    for (const p of pieces) { sumX += p.x; sumY += p.y; }
    const avgX = pieces.length > 0 ? sumX / pieces.length : 0;
    const avgY = pieces.length > 0 ? sumY / pieces.length : 0;

    let sumSqDiff = 0;
    for (const p of pieces) sumSqDiff += (p.x - avgX) ** 2;
    const stdXBound = [avgX - Math.sqrt(sumSqDiff / pieces.length), avgX + Math.sqrt(sumSqDiff / pieces.length)];

    let sumSqDiffY = 0;
    for (const p of pieces) sumSqDiffY += (p.y - avgY) ** 2;
    const stdYBound = [avgY - Math.sqrt(sumSqDiffY / pieces.length), avgY + Math.sqrt(sumSqDiffY / pieces.length)];

    const stdDist = Math.sqrt((stdXBound[0] - stdXBound[1]) ** 2 + (stdYBound[0] - stdYBound[1]) ** 2);
    const aspectRatio = stdDist < cellSize / 2 ? 0.5 : ((stdYBound[1] - stdYBound[0]) / Math.max(0.001, (stdXBound[1] - stdXBound[0])));

    const groupSizes = selection.map(group => {
        const { w, h } = getGroupSize(group, room);
        return {
            w: Math.ceil(w / cellSize),
            h: Math.ceil(h / cellSize),
            x: -1, y: -1, group
        };
    });

    const boardMaxWidth = Math.floor(room.boardWidth / cellSize) || 1;
    const boardMaxHeight = Math.floor(room.boardHeight / cellSize) || 1;

    let estimatedMaxWidth = Math.max(1, Math.min(boardMaxWidth, Math.round(Math.sqrt(groupSizes.reduce((a, b) => a + b.w * b.h, 0) / aspectRatio))));
    let res = potpack([...groupSizes], estimatedMaxWidth, boardMaxHeight);

    while (estimatedMaxWidth < boardMaxWidth && groupSizes.some(x => x.x < 0 || x.y < 0)) {
        estimatedMaxWidth += 1;
        groupSizes.forEach(x => x.x = x.y = -1);
        res = potpack([...groupSizes], estimatedMaxWidth, boardMaxHeight);
    }

    const gridW = res.w * cellSize;
    const gridH = res.h * cellSize;

    let gridX = avgX - gridW / 2;
    let gridY = avgY - gridH / 2;

    gridX = clamp(0, gridX, room.boardWidth - gridW);
    gridY = clamp(0, gridY, room.boardHeight - gridH);

    const boardCenterOffset = { x: (room.boardWidth % cellSize) / 2, y: (room.boardHeight % cellSize) / 2 };
    gridX = Math.round(gridX / cellSize) * cellSize + boardCenterOffset.x;
    gridY = Math.round(gridY / cellSize) * cellSize + boardCenterOffset.y;
    gridX = clamp(boardCenterOffset.x, gridX, room.boardWidth - gridW - boardCenterOffset.x);
    gridY = clamp(boardCenterOffset.y, gridY, room.boardHeight - gridH - boardCenterOffset.y);

    const requiredCellsCount = groupSizes.map(x => x.h * x.w).reduce((a, b) => a + b);
    const cells: { x: number, y: number }[] = [];
    for (let i = 0; i < requiredCellsCount; i++) {
        const col = i % res.w;
        const row = Math.floor(i / res.w);
        cells.push({ x: gridX + cellSize / 2 + col * cellSize, y: gridY + cellSize / 2 + row * cellSize });
    }

    const affectedGroups: Group[] = [];
    for (const item of groupSizes.filter(x => x.group.indices.length > 1)) {
        let groupCellIndices = [];
        for (let y = item.y; y < item.y + item.h; y++) {
            const start = y * res.w + item.x;
            for (let x = start; x < start + item.w; x++) groupCellIndices.push(x);
        }
        let cx = 0, cy = 0;
        for (const idx of groupCellIndices) { cx += cells[idx].x; cy += cells[idx].y; }
        cx /= groupCellIndices.length; cy /= groupCellIndices.length;
        if (moveGroup(item.group, { x: cx, y: cy }, speed)) affectedGroups.push(item.group);
        groupCellIndices.forEach(idx => (cells as any)[idx] = null);
    }

    const unassignedCells = cells.filter((x): x is { x: number, y: number } => x !== null);
    const remainingGroups = selection.filter(g => g.indices.length <= 1);

    if (remainingGroups.length > 0) {
        const costMatrix: number[][] = [];
        const matrixSize = remainingGroups.length;
        for (let i = 0; i < matrixSize; i++) {
            costMatrix[i] = [];
            for (let j = 0; j < matrixSize; j++) {
                const dx = remainingGroups[i].x - unassignedCells[j].x;
                const dy = remainingGroups[i].y - unassignedCells[j].y;
                costMatrix[i][j] = Math.sqrt(dx * dx + dy * dy);
            }
        }
        const optimalIndices = munkres(costMatrix);
        for (let i = 0; i < optimalIndices.length; i++) {
            const group = remainingGroups[optimalIndices[i][0]];
            const cell = unassignedCells[optimalIndices[i][1]];
            moveGroup(group, cell, speed);
        }
    }

    const newRaw = Buffer.alloc(7 + selection.length * 2);
    newRaw.set(raw.slice(0, 7), 0);
    for (let i = 0; i < selection.length; i++) {
        newRaw.writeUint16LE(selection[i].id, 7 + i * 2);
    }
    runtime.broadcaster.broadcast(newRaw, user.user.id, true);
}

export function arrangePiecesPack(payload: any, raw: Buffer, user: UserPrivate, room: Room, state: RoomState, runtime: RoomRuntimeState) {
    const { maxPieceWidth, maxPieceHeight } = getMaxPieceSize(room);
    const distance = (maxPieceWidth + maxPieceHeight) / 4;

    const selection: Group[] = [];
    for (const g of runtime.transformedgroups.values()) {
        if (g.selected === user.user.id || g.dragged === user.user.id) {
            selection.push(g);
        }
    }
    if (selection.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const group of selection) {
        minX = Math.min(minX, group.x);
        minY = Math.min(minY, group.y);
        maxX = Math.max(maxX, group.x);
        maxY = Math.max(maxY, group.y);
    }
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    for (const s of selection) {
        let dx = midX - s.x;
        let dy = midY - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < distance) {
            s.x = midX;
            s.y = midY;
        } else {
            s.x += (dx / dist) * distance;
            s.y += (dy / dist) * distance;
        }
        preventMovementOOB(s, room);
    }
    const newRaw = Buffer.alloc(7 + selection.length * 2);
    newRaw.set(raw.slice(0, 7), 0);
    for (let i = 0; i < selection.length; i++) {
        newRaw.writeUint16LE(selection[i].id, 7 + i * 2);
    }
    runtime.broadcaster.broadcast(newRaw, user.user.id, true);
}

export function arrangePiecesSpread(payload: any, raw: Buffer, user: UserPrivate, room: Room, state: RoomState, runtime: RoomRuntimeState) {
    const { maxPieceWidth, maxPieceHeight } = getMaxPieceSize(room);
    const maxDistance = Math.max(maxPieceWidth, maxPieceHeight) * idealDistance + 1;
    const maxDistanceSquared = maxDistance * maxDistance;
    const speed = (maxPieceWidth + maxPieceHeight) / 4;
    const r = new Random(payload.state);

    const selection: Group[] = [];
    for (const g of runtime.transformedgroups.values()) {
        if (g.selected === user.user.id || g.dragged === user.user.id) {
            selection.push(g);
        }
    }
    if (selection.length === 0) return;

    for (const p1 of selection) {
        let nearestSquared = maxDistanceSquared;
        let offsetX = 0;
        let offsetY = 0;

        for (const p2 of selection) {
            if (p1 === p2) continue;
            const pieces2 = getGroupPiecesAbsolute(p2, room);
            for (const p2abs of pieces2) {
                const dx = p1.x - p2abs.x;
                const dy = p1.y - p2abs.y;
                const magSq = dx * dx + dy * dy;
                if (magSq < nearestSquared) nearestSquared = magSq;
                if (magSq > 0) {
                    const norm = 1 / (magSq * magSq);
                    offsetX += dx * norm;
                    offsetY += dy * norm;
                }
            }
        }

        if (nearestSquared >= maxDistanceSquared) continue;
        const magnitude = Math.sqrt(offsetX * offsetX + offsetY * offsetY) || 1;

        const targetX = p1.x + (offsetX / magnitude + (r.next() - 0.5)) * speed;
        const targetY = p1.y + (offsetY / magnitude + (r.next() - 0.5)) * speed;
        p1.x = targetX;
        p1.y = targetY;
        preventMovementOOB(p1, room);
    }
    const newRaw = Buffer.alloc(7 + selection.length * 2);
    newRaw.set(raw.slice(0, 7), 0);
    for (let i = 0; i < selection.length; i++) {
        newRaw.writeUint16LE(selection[i].id, 7 + i * 2);
    }
    runtime.broadcaster.broadcast(newRaw, user.user.id, true);
}
