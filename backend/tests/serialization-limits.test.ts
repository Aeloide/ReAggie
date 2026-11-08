import { describe, expect, it } from "vitest";
import { serializeGroup } from "../src/utils.js";

describe("large group persistence", () => {
    it("serializes unsigned group lengths above 32767", () => {
        const count = 32_768;
        const group: any = {
            id: 0,
            ids: Array.from({ length: count }, (_, index) => index),
            indices: Array.from({ length: count }, (_, index) => index),
            set: 0,
            x: 1,
            y: 2
        };

        const serialized = serializeGroup(group, false);

        expect(serialized.readUInt16LE(12)).toBe(count);
        expect(serialized.readUInt16LE(14)).toBe(count);
    });
});
