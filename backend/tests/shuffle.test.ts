import { describe, it, expect } from 'vitest';
import shuffle from '../src/shuffle.js';

describe('shuffle', () => {
    it('should shuffle array in place', () => {
        const arr = [1, 2, 3, 4, 5];
        const original = [...arr];

        shuffle.Knuth(arr);

        expect(arr).toHaveLength(original.length);
        expect(arr).toEqual(expect.arrayContaining(original));
        // It is possible but unlikely that it returns same order. 
        // We can check it is NOT reference equal to original? No, it's in-place.
    });

    it('should handle empty array', () => {
        const arr: any[] = [];
        shuffle.Knuth(arr);
        expect(arr).toEqual([]);
    });

    it('should handle single element', () => {
        const arr = [1];
        shuffle.Knuth(arr);
        expect(arr).toEqual([1]);
    });
});
