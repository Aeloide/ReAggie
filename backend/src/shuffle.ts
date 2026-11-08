/**
 * {@link https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#The_modern_algorithm | Knuth shuffle}.
 * Stolen from {@link https://bost.ocks.org/mike/shuffle/} at 2023-09-19
 * */
export default {
    Knuth<T>(array: T[]): void {
        let remaining = array.length, swap, i;

        // While there remain elements to shuffle…
        while (remaining) {

            // Pick a remaining element…
            i = Math.floor(Math.random() * remaining--);

            // And swap it with the current element.
            swap = array[remaining];
            array[remaining] = array[i];
            array[i] = swap;
        }
    }
};