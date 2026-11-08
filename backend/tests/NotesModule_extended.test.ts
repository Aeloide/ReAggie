
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
            events: new EventEmitter(),
            broadcaster: {
                broadcast: vi.fn()
            }
        };

        mockRoom = {};

        mockUser = {
            name: 'testUser',
            id: 1
        };

        mockUserP = {
            host: { Notes: true },
            conn: { send: vi.fn() },
            ipaddr: '127.0.0.1'
        };

        module.attach({ state: {}, runtime: mockState, room: mockRoom } as any);
    });

    it('should attach and listen for connections', () => {
        module.notes = [{ id: 1, text: 'Hi', color: '#fff', align: 'center', region: [[0, 0] as any, [10, 10] as any] }];

        // Simulate a connection
        const newUserP = { conn: { send: vi.fn() } };
        mockState.events.emit('connected', newUserP);

        expect(newUserP.conn.send).toHaveBeenCalledWith(expect.stringContaining('notes'));
    });

    it('should serialize and deserialize', () => {
        module.notes = [{ id: 1, text: 'Hi', color: '#fff', align: 'center', region: [[0, 0] as any, [10, 10] as any] }];
        module.nextId = 5;

        const data = module.serialize();
        const module2 = new NotesModule();
        module2.deserialize(data);

        expect(module2.notes.length).toBe(1);
        expect(module2.nextId).toBe(5);
    });

    it('should deserialize undefined', () => {
        module.deserialize(undefined);
        expect(module.notes).toEqual([]);
    });

    describe('addNote', () => {
        it('should enforce permissions', () => {
            mockUserP.host.Notes = false;
            module.addNote({ state: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Can't let you do that"));
        });

        it('should validate usage', () => {
            module.addNote({ state: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, 'garbage');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Usage:"));
        });

        it('should validate text', () => {
            // Valid coords but empty text (Note: split on ; might produce empty string if input is just coords)
            // But the regex expects text part.
            // "0 0 10 10  " -> match[9] is " "
            // " ".split(';') -> [" "] -> text is " " -> truthy?
            // "0 0 10 10 ;red" -> text=""

            module.addNote({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '0', '0', '10', '10', ';red');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Note text is required"));
        });

        it('should add note successfully', () => {
            module.addNote({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '0', '0', '10', '10', 'hello;red;left');

            expect(module.notes.length).toBe(1);
            expect(module.notes[0].text).toBe('hello');
            expect(module.notes[0].color).toBe('red');
            expect(module.notes[0].align).toBe('left');
            expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
        });

        it('should use defaults', () => {
            module.addNote({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '0', '0', '10', '10', 'hello');

            expect(module.notes[0].color).toBe('#ffffff');
            expect(module.notes[0].align).toBe('center');
        });
    });

    describe('delNote', () => {
        it('should enforce permissions', () => {
            mockUserP.host.Notes = false;
            module.delNote({ state: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Can't let you do that"));
        });

        it('should validate id', () => {
            module.delNote({ state: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, 'nan');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Usage:"));
        });

        it('should warn if not found', () => {
            module.delNote({ state: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '999');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("not found"));
        });

        it('should delete note', () => {
            module.notes = [{ id: 1, text: 'Hi', color: 'r', align: 'c', region: [[0, 0] as any, [0, 0] as any] }];
            module.delNote({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '1');

            expect(module.notes.length).toBe(0);
            expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("deleted"));
        });
    });

    describe('clearAllNotes', () => {
        it('should enforce permissions', () => {
            mockUserP.host.Notes = false;
            module.clearAllNotes({ state: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Can't let you do that"));
        });

        it('should clear all notes', () => {
            module.notes = [{ id: 1 } as any];
            module.clearAllNotes({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(module.notes.length).toBe(0);
            expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
        });
    });
});
