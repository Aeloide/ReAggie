import type { Group, PSet, vec2 } from "./types.js";

export const adjustedDims = (dims: vec2[], min = 1500): vec2[] => {
    const normalized = dims.map(d => {
        const factor = Math.max(1, min / d[0], min / d[1]);
        return [d[0] * factor, d[1] * factor] as vec2;
    });

    const areas = normalized.map(d => d[0] * d[1]);
    const targetArea = Math.max(...areas);

    return normalized.map((d, i) => {
        const scaleFactor = Math.sqrt(targetArea / areas[i]);
        return [d[0] * scaleFactor, d[1] * scaleFactor] as vec2;
    });
};

export const fitGroupsToBoard = (groups: Group[], sets: PSet[], padding = 500) => {
    const groupDimensions = (group: Group): vec2 => {
        const set = sets[group.set]!;
        if (set.sites?.length) {
            if (group.indices.length > 1) return [set.width, set.height];
            const approximateSide = Math.sqrt((set.width * set.height) / set.sites.length) * 2;
            return [approximateSide, approximateSide];
        }

        const pieceWidth = set.pieceWidth || set.width / set.cols;
        const pieceHeight = set.pieceHeight || set.height / set.rows;
        let minCol = Infinity;
        let maxCol = -Infinity;
        let minRow = Infinity;
        let maxRow = -Infinity;
        for (const index of group.indices) {
            const col = index % set.cols;
            const row = Math.floor(index / set.cols);
            minCol = Math.min(minCol, col);
            maxCol = Math.max(maxCol, col);
            minRow = Math.min(minRow, row);
            maxRow = Math.max(maxRow, row);
        }
        let width = (maxCol - minCol + 1) * pieceWidth;
        let height = (maxRow - minRow + 1) * pieceHeight;
        if (group.rot === 1 || group.rot === 3)
            [width, height] = [height, width];
        return [width, height];
    };

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const group of groups) {
        if (group.x >= 0xDEADC0DE || group.y >= 0xDEADC0DE) continue;
        const [width, height] = groupDimensions(group);
        minX = Math.min(minX, group.x - width / 2);
        minY = Math.min(minY, group.y - height / 2);
        maxX = Math.max(maxX, group.x + width / 2);
        maxY = Math.max(maxY, group.y + height / 2);
    }

    if (!Number.isFinite(minX)) {
        minX = 0;
        minY = 0;
        maxX = Math.max(0, ...sets.map(set => set.width));
        maxY = Math.max(0, ...sets.map(set => set.height));
    }

    const shiftX = padding - minX;
    const shiftY = padding - minY;
    for (const group of groups) {
        group.x += shiftX;
        group.y += shiftY;
    }

    return {
        boardWidth: maxX - minX + padding * 2,
        boardHeight: maxY - minY + padding * 2
    };
};