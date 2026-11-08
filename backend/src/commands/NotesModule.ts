
import { Rectangle, RoomState, UserPrivate } from "../types.js";
import { ChatModule, Command, CommandRoomStateArg, CommandRoomStateUserArg } from "./index.js";
import { send_system } from "../room-utils.js";
import { RoomBroadcaster } from "../core/room-broadcaster.js";

interface Note {
    id: number;
    text: string;
    color: string;
    align: string;
    region: Rectangle;
    scale?: number;
}

export class NotesModule implements ChatModule {
    name = 'notes';

    notes: Note[] = [];
    nextId = 0;

    serialize() {
        return {
            notes: this.notes,
            nextId: this.nextId
        };
    }

    deserialize(d: any): void {
        if (!d) return;
        this.notes = d.notes || [];
        this.nextId = d.nextId || (this.notes.length > 0 ? Math.max(...this.notes.map(n => n.id)) + 1 : 0);
    }

    addNote({ room, state, runtime, userp, user }: CommandRoomStateUserArg, ...args: string[]) {
        if (!userp.host.Notes) {
            send_system(userp, user, "Can't let you do that, Dave...");
            return true;
        }

        // Expected args: x1 y1 x2 y2 text;color;align
        // We need to parse this carefully because text might contain spaces.
        // The first 4 args should be numbers.

        // Reconstruct the full string first to handle the split properly
        const fullArg = args.join(' ');

        // Regex to match: numbers numbers numbers numbers rest
        const match = fullArg.match(/^(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s+(.+)$/);

        if (!match) {
            send_system(userp, user, "Usage: /addnote x1 y1 x2 y2 text;color;align");
            return true;
        }

        const x1 = parseFloat(match[1]);
        const y1 = parseFloat(match[3]);
        const x2 = parseFloat(match[5]);
        const y2 = parseFloat(match[7]);
        const rest = match[9];

        const [text, color, align, scaleStr] = rest.split(';');
        const scale = scaleStr ? parseFloat(scaleStr) : 1;

        if (!text) {
            send_system(userp, user, "Note text is required.");
            return true;
        }

        const note: Note = {
            id: this.nextId++,
            region: [[x1, y1], [x2, y2]],
            text: text,
            color: color || '#ffffff', // Default white
            align: align || 'center',   // Default center
            scale: scale || 1
        };

        this.notes.push(note);
        this.broadcastNotes(runtime.broadcaster);

        return true;
    }

    delNote({ room, state, runtime, userp, user }: CommandRoomStateUserArg, ...args: string[]) {
        if (!userp.host.Notes) {
            send_system(userp, user, "Can't let you do that, Dave...");
            return true;
        }

        const id = parseInt(args[0]);
        if (isNaN(id)) {
            send_system(userp, user, "Usage: /delnote [id]");
            return true;
        }

        const initialLength = this.notes.length;
        this.notes = this.notes.filter(n => n.id !== id);

        if (this.notes.length !== initialLength) {
            this.broadcastNotes(runtime.broadcaster);
            send_system(userp, user, `Note ${id} deleted.`);
        } else {
            send_system(userp, user, `Note ${id} not found.`);
        }

        return true;
    }

    clearAllNotes({ room, state, runtime, userp, user }: CommandRoomStateUserArg, ...args: string[]) {
        if (!userp.host.Notes) {
            send_system(userp, user, "Can't let you do that, Dave...");
            return true;
        }

        this.notes = [];
        this.broadcastNotes(runtime.broadcaster);
        send_system(userp, user, "All notes cleared.");
        return true;
    }

    broadcastNotes(broadcaster: RoomBroadcaster) {
        broadcaster.broadcast({
            type: "notes",
            notes: this.notes
        });
    }

    commands: Command[] = [{
        name: 'addnote',
        desc: `
Usage: /addnote x1 y1 x2 y2 text;color;align;scale
Effect: Adds a note to the specified region.
`,
        handler: this.addNote.bind(this)
    }, {
        name: 'delnote',
        desc: `
Usage: /delnote id
Effect: Deletes the note with the specified ID.
`,
        handler: this.delNote.bind(this)
    }, {
        name: 'clearallnotes',
        desc: `
Usage: /clearallnotes
Effect: Deletes all notes.
`,
        handler: this.clearAllNotes.bind(this)
    }];

    attach({ room, state, runtime }: CommandRoomStateArg): void {
        runtime.events.addListener("connected", (up: UserPrivate) => {
            // Send current notes to newly connected user
            if (this.notes.length > 0) {
                up.conn.send(JSON.stringify({
                    type: "notes",
                    notes: this.notes
                }));
            }
        });
    }
}
