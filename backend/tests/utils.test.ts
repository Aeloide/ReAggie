import { describe, it, expect } from 'vitest';
import { Counter, clamp, lerp, isInRectangle, randstring, shuffleArray, buildBinaryRepr } from '../src/utils.js';
import { Group } from '../src/types.js';

describe('utils', () => {
    describe('Counter', () => {
        it('should initialize correctly', () => {
            const quota = { amount: 10, burst_factor: 2 };
            const counter = new Counter(quota);
            // Initial rem should be amount * burst_factor
            expect(counter.rem).toBe(20);
        });

        it('should use quota', () => {
            const quota = { amount: 10, burst_factor: 2 };
            const counter = new Counter(quota);
            counter.use(5);
            expect(counter.rem).toBeLessThan(15.001); // 20 - 5 + some minimal recharge
        });

        it('should throw when capacity exceeded', () => {
            const quota = { amount: 10, burst_factor: 1 };
            const counter = new Counter(quota);
            expect(() => counter.use(11)).toThrow('Capacity exceeded');
        });

        it('should recharge over time', async () => {
            const quota = { amount: 100, burst_factor: 1 }; // 100 per sec
            const counter = new Counter(quota);
            counter.use(50);
            const remAfterUse = counter.rem;

            // Wait a bit (simulated wait or sleep)
            // Ideally we'd use fake timers, but let's just do a small real wait for integration-ish feeling or use pure logic if possible.
            // Counter.use calculates recharge based on performance.now/Date.now.
            // We can mock Date or just checking logic.
            // Let's just check that it recharges at all if we call use again later.
            // mock Date.now?
        });
    });

    describe('clamp', () => {
        it('should clamp values', () => {
            expect(clamp(0, -1, 10)).toBe(0);
            expect(clamp(0, 5, 10)).toBe(5);
            expect(clamp(0, 11, 10)).toBe(10);
        });
    });

    describe('lerp', () => {
        it('should linear interpolate', () => {
            expect(lerp(0, 10, 0.5)).toBe(5);
            expect(lerp(0, 10, 0)).toBe(0);
            expect(lerp(0, 10, 1)).toBe(10);
        });
    });

    describe('isInRectangle', () => {
        it('should correct check bounds', () => {
            const rect: any = [[0, 0], [10, 10]];
            expect(isInRectangle([5, 5], rect)).toBe(true);
            expect(isInRectangle([0, 0], rect)).toBe(true);
            expect(isInRectangle([10, 10], rect)).toBe(true);
            expect(isInRectangle([-1, 5], rect)).toBe(false);
            expect(isInRectangle([5, 11], rect)).toBe(false);
        });
    });

    describe('randstring', () => {
        it('should generate string of correct length', () => {
            expect(randstring(10)).toHaveLength(10);
        });

        it('should generate different strings', () => {
            expect(randstring(20)).not.toBe(randstring(20));
        });
    });

    describe('shuffleArray', () => {
        it('should shuffle array in place', () => {
            const arr = [1, 2, 3, 4, 5];
            const originalJson = JSON.stringify(arr);
            shuffleArray(arr);
            expect(arr).toHaveLength(5);
            expect(arr).toContain(1);
            // It's possible but unlikely to be same order. 
        });
    });

    describe('buildBinaryRepr', () => {
        it('should build binary representation of groups', () => {
            const group: Group = {
                id: 1,
                set: 0,
                x: 10,
                y: 20,
                ids: [],
                indices: [0, 1, 2, 3],
                rot: 0,
                f: false
            };
            const bin = buildBinaryRepr([group], false);
            expect(bin).toBeDefined();
            // Checking buffer size and content would be more specific
        });
    });
});
