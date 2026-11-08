export interface Sequencer {
  next(): number;
}

// stateless so technically we could have only one instance up, but eh...
export class RandomSequencer implements Sequencer {
  next() {
    return ~~((Math.random() - 0.5) * 12);
  }
}

export class TrackSequencer implements Sequencer {
  i = 0;
  minNote;
  constructor(private track: number[]) {
    this.minNote = Math.min(...track);
  }

  next() {
    if (this.i >= this.track.length) this.i = 0;
    const note = this.track[this.i++];
    return note - (this.minNote + 12);
  }
}
