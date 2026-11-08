export const shuffleArray = <T>(array: T[], r: Random) => {
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1));
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
  }
};

export class Random {
    state: number;
  
    constructor(seed: number) {
      this.state = seed;
    }
  
    /**
     * Generate the next psuedorandom number.
     * @param min Minimum (exclusive)
     * @param max Maximum (exclusive)
     */
    nextInterval(min: number, max: number): number {
      return min + ((this.next() + this.next() + this.next() + this.next()) / 4) * (max - min);
    }
  
    /**
     * Generate the next psuedorandom number
     * @returns Number between 0 (inclusive) and 1 (exclusive)
     */
    next() {
      const n = 1e4 * Math.sin(this.state);
      this.state += 1;
      return n - Math.floor(n);
    }
  }
  