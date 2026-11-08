import { UserPrivate } from "../types.js";

export abstract class Process {
    constructor(private id: number,
        private owner: UserPrivate) {
            
    }

    abstract code(): string;

    refresh() {
        this.owner.conn.send(JSON.stringify({
            type: 'proc',
            id: this.id,
            code: this.code()
        }));
    }

    clear() {
        this.owner.conn.send(JSON.stringify({
            type: 'remproc',
            id: this.id,
        }));
    }
}

export class TextProgress extends Process {
    value = 0;
    label = '';
    constructor(id: number, owner: UserPrivate) {
        super(id, owner);
    }

    code() {
        return `
        <label>${this.label}</label>
        <progress max="100" value="${this.value}"></progress>
        `;
    }
}