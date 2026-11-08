import type { Game } from "./game";
import type { MouseEventWrapper } from "./game-view-state";

export type Entity = {
    id: number;
    // misnomer, doesn't actually need to do a rendering, but to "prepare things for rendering"
    doRender(): void;
    update(t: number, dt: number): void;
}

// TODO: kinda broken until we remove the old renderers
export type EntityManager = {
    // will do actual rendering work, usually through instanced rendering
    doRender(): void;
    doPostRender?(): void;
    update(t: number, dt: number): void;
    die(): void;

    // technically should work independently of renderer but...
    // maybe the renderers should be broken up into better pieces rather than
    // trying to cram them
    init(game: Game): Promise<EntityManager>;
    allocNew(id: number): Entity;
    dealloc(id: number): void;
    process(dv: DataView): void;

    wants(ev: MouseEvent, stop: () => void): MouseEventWrapper | void;
    moved?(ev: MouseEvent): void;
    pick(x: number, y: number): Entity | void;
    dirty(): boolean;
}

class DummyEntity implements Entity {
    id = 0;
    doRender(): void {
    }

    update(t: number, dt: number): void {
    }
}

export class DummyManager implements EntityManager {
    wants(): MouseEventWrapper | void {
    }

    doRender(): void {
    }

    update(t: number, dt: number): void {
    }

    pick() {}

    die(): void {
    }

    async init(game: Game): Promise<EntityManager> {
        return this;
    }

    allocNew(id: number): Entity {
        return new DummyEntity;
    }

    dealloc(id: number): void {
    }

    process(dv: DataView): void {
    }

    dirty(): boolean {
        return false;
    }
}