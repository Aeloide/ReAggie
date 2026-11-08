import type { UserPrivate } from "./types.js";
import { clauseToChecker, sameClause } from "./utils.js";
import { runtime } from "./room.js";
import type { Token } from "./db.js";

export class MuteEvaluator {
    clausefuncs: ((ip: string, asn: number) => boolean)[] = [];
    _mutedusers = new Set<UserPrivate>();

    dirty = true;
    get mutedUsers() {
        if (this.dirty) {
            this._mutedusers = new Set([...runtime.usersPriv.values()].filter(up => this.shouldMute(up.ipaddr, up.asn)));
            this.dirty = false;
        }
        return this._mutedusers;
    }

    constructor(public clauses: Token['mutelist']) {
        this.clausefuncs = clauses.map(clauseToChecker);
    }

    addClause(clause: Token['mutelist'][number]) {
        const clauseidx = this.clauses.findIndex(sameClause(clause));
        if (clauseidx !== -1) // already exist
            return false;
        this.clauses.push(clause);
        this.clausefuncs.push(clauseToChecker(clause));
        this.dirty = true;
        return true;
    }

    removeClause(clause: Token['mutelist'][number]) {
        const clauseidx = this.clauses.findIndex(sameClause(clause));
        if (clauseidx === -1) // doesn't exist
            return false;
        this.clauses.splice(clauseidx, 1);
        this.clausefuncs.splice(clauseidx, 1);
        this.dirty = true;
        return true;
    }

    shouldMute(ip: string, asn: number) {
        return this.clausefuncs.some(f => f(ip, asn));
    }
}
