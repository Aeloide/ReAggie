import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotesModule } from '../src/commands/NotesModule.js';
import { EventEmitter } from 'events';
import { send_system } from '../src/room-utils.js';

// Mock room-utils
vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn(),
}));

describe('NotesModule', () => {
    let module: NotesModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;

    beforeEach(() => {
        vi.clearAllMocks();
        module = new NotesModule();

        mockState = {
            broadcaster: {
                broadcast: vi.fn()
            },
            events: new EventEmitter()
        };

        mockRoom = {};

        mockUser = {
            name: 'testUser',
            color: '#000000',
            id: 1
        };

        mockUserP = {
            host: {},
            conn: { send: vi.fn() }
        };
    });

    describe('addNote', () => {
        it('should fail if no permissions', () => {
            mockUserP.host = { Notes: false };
            const res = module.addNote({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '0', '0', '10', '10', 'text');
            expect(res).toBe(true);
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Can't let you do that"));
        });

        it('should add note', () => {
            mockUserP.host = { Notes: true };
            const res = module.addNote({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '0', '0', '100', '100', 'hello;red;center');
            expect(res).toBe(true);
            expect(module.notes.length).toBe(1);
            expect(module.notes[0]).toMatchObject({
                text: 'hello',
                color: 'red',
                align: 'center',
                region: [[0, 0], [100, 100]]
            });
            expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
        });

        it('should handle missing note text', () => {
            mockUserP.host = { Notes: true };
            // invalid args, text empty but regex matches
            const res = module.addNote({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '0', '0', '100', '100', ';red');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Note text is required"));
        });
    });

    describe('delNote', () => {
        beforeEach(() => {
            module.notes = [
                { id: 0, text: 'test', color: 'red', align: 'center', region: [[0, 0], [10, 10]] }
            ];
            module.nextId = 1;
        });

        it('should delete existing note', () => {
            mockUserP.host = { Notes: true };

            module.delNote({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '0');

            expect(module.notes.length).toBe(0);
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("deleted"));
            expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
        });

        it('should fail if not found', () => {
            mockUserP.host = { Notes: true };

            module.delNote({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '999');

            expect(module.notes.length).toBe(1);
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("not found"));
        });
    });

    describe('clearAllNotes', () => {
        it('should clear all notes', () => {
            mockUserP.host = { Notes: true };
            module.notes = [{ id: 1 } as any];

            module.clearAllNotes({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(module.notes.length).toBe(0);
            expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
        });
    });
    describe('Serialization', () => {
        it('should serialize and deserialize notes', () => {
            const note: any = { id: 1, text: 'hi', color: 'red', align: 'center', region: [[0, 0], [10, 10]] };
            module.notes = [note];
            module.nextId = 2;

            const data = module.serialize();

            const newModule = new NotesModule();
            newModule.deserialize(data);

            expect(newModule.notes.length).toBe(1);
            expect(newModule.notes[0]).toEqual(note);
            expect(newModule.nextId).toBe(2);
        });

        it('should recalculate nextId if missing in deserialization', () => {
            const note: any = { id: 5, text: 'hi' }; // minimal
            module.deserialize({ notes: [note] });
            expect(module.nextId).toBe(6); // max(5)+1
        });
    });
});
