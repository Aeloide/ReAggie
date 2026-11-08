
import { describe, it, expect, vi } from 'vitest';
import { ReplayModule } from '../src/commands/ReplayModule.js';

describe('ReplayModule Serialization', () => {
    it('should serialize and deserialize', () => {
        const module = new ReplayModule();
        module.isFirst = false;

        const data = module.serialize();
        expect(data).toEqual({ isFirst: false });

        const module2 = new ReplayModule();
        module2.deserialize(data);
        expect(module2.isFirst).toBe(false);
    });

    it('should handle undefined deserialize', () => {
        const module = new ReplayModule();
        module.deserialize(undefined);
        expect(module.isFirst).toBe(true); // default
    });
});
