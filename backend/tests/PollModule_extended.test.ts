import { describe, it, expect, vi, beforeEach } from 'vitest';
import PollHandlers, { PollModule } from '../src/commands/PollModule.js';
import { send_system } from '../src/room-utils.js';
import { EventEmitter } from 'events';

vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn()
}));

describe('PollModule Extended', () => {
    let module: PollModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;

    const invokeBinHandler = (cmdId: number, buf: Buffer, userp: any) => {
        const entry = (PollHandlers as any).default?.[cmdId] || (PollHandlers as any)[cmdId];
        if (!entry) throw new Error(`No handler for ${cmdId}`);
        const [struct, handler] = entry;
        try {
            const payload = struct.parse(buf.subarray(1));
            return handler(payload, buf, userp, mockRoom, {}, mockState);
        } catch (e) {
            return undefined;
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset Singleton State
        // Since we can't easily access the singleton via class, create new one and manually reset properties
        module = new PollModule();
        // Since it's a singleton, this instance IS the singleton
        module.polling = false;
        module.kaos = [];
        module.zones = [];
        delete module.question;
        delete module.track;

        mockState = {
            events: new EventEmitter(),
            usersPriv: new Map(),
            users: [],
            broadcaster: { broadcast: vi.fn() },
            binCodeHandlers: new Map() // We don't really use this since we use invokeBinHandler helper
        };

        mockRoom = {
            boardWidth: 1000,
            boardHeight: 1000
        };
        mockUserP = {
            host: { Poll: true },
            conn: { send: vi.fn() },
            user: { id: 1 }
        };
        mockUser = { id: 1 };
        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
    });

    describe('input validation and permissions', () => {
        it('startPoll should fail if no permission', () => {
            mockUserP.host.Poll = false;
            const cmd = module.commands.find(c => c.name === 'startpoll');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, 'Q;A;B');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Can't let you do that"));
        });

        it('startPoll should fail if already polling', () => {
            module.polling = true;
            const cmd = module.commands.find(c => c.name === 'startpoll');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, 'Q;A;B');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("already a poll"));
        });

        it('startPoll should fail if not enough choices', () => {
            const cmd = module.commands.find(c => c.name === 'startpoll');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, 'Q;A');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("at least two choices"));
        });

        it('inputSetup should fail if no permission', () => {
            mockUserP.host.Poll = false;
            const cmd = module.commands.find(c => c.name === 'setupZone');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '0', '0', '1', '1');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Can't let you do that"));
        });

        it('inputSetup should fail if not setting up', () => {
            const cmd = module.commands.find(c => c.name === 'setupZone');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '0', '0', '1', '1');
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Not currently setting up"));
        });

        it('inputSetup should fail if wrong arg count', () => {
            module.setupState = {} as any; // fake setup state
            const cmd = module.commands.find(c => c.name === 'setupZone');
            // 3 args instead of 4
            const res = cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '0', '0', '1');
            expect(res).toBe(true);
            // setupState.next not called (would crash if called on fake object without next)
        });

        it('stopPoll should fail if no permission', () => {
            mockUserP.host.Poll = false;
            const cmd = module.commands.find(c => c.name === 'stoppoll');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any);
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("Can't let you do that"));
        });

        it('stopPoll should fail if not polling', () => {
            module.polling = false;
            const cmd = module.commands.find(c => c.name === 'stoppoll');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any);
            expect(send_system).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining("nothing to stop"));
        });
    });

    describe('Binary handlers', () => {
        beforeEach(() => {
            // Setup some kaos
            module.kaos = [{ pos: [10, 10] }, { pos: [20, 20] }];
        });

        describe('kaomove (0x41)', () => {
            it('should ignore short buffer', () => {
                const buf = Buffer.alloc(7); // < 8
                invokeBinHandler(0x41, buf, mockUserP);
                expect(mockState.broadcaster.broadcast).not.toHaveBeenCalled();
            });

            it('should ignore out of bounds kaoid', () => {
                const buf = Buffer.alloc(10);
                buf[1] = 99; // kaoid
                invokeBinHandler(0x41, buf, mockUserP);
                expect(mockState.broadcaster.broadcast).not.toHaveBeenCalled();
            });

            it('should update position and broadcast', () => {
                const buf = Buffer.alloc(10);
                buf[1] = 0; // kaoid 0
                buf.writeFloatLE(100, 2); // x
                buf.writeFloatLE(200, 6); // y

                invokeBinHandler(0x41, buf, mockUserP);

                expect(module.kaos[0].pos[0]).toBeCloseTo(100);
                expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
            });
        });

        describe('kaohold (0x42/0x43)', () => {
            it('should ignore short buffer', () => {
                const buf = Buffer.alloc(1); // < 2
                invokeBinHandler(0x42, buf, mockUserP);
                expect(mockState.broadcaster.broadcast).not.toHaveBeenCalled();
            });

            it('should ignore out of bounds kaoid', () => {
                const buf = Buffer.alloc(2);
                buf[1] = 99;
                invokeBinHandler(0x42, buf, mockUserP);
                expect(mockState.broadcaster.broadcast).not.toHaveBeenCalled();
            });

            it('should broadcast', () => {
                const buf = Buffer.alloc(2);
                buf[0] = 0x42;
                buf[1] = 0;
                invokeBinHandler(0x42, buf, mockUserP);
                expect(module.kaos[0].heldBy).toBe(mockUserP.user.id);
                expect(mockState.broadcaster.broadcast).toHaveBeenCalled();
            });
        });
    });

    describe('Event listeners', () => {
        it('should send poll data on connection if polling', () => {
            module.polling = true;
            module.question = "Q";
            module.kaos = [{ pos: [0, 0] }];
            module.zones = [['A', [[0, 0], [1, 1]]]];

            mockState.events.emit('connected', mockUserP);

            expect(send_system).toHaveBeenCalled(); // "A poll has started"
            expect(mockUserP.conn.send).toHaveBeenCalledTimes(2); // zones and kaos
        });

        it('should not send poll data if not polling', () => {
            module.polling = false;
            mockState.events.emit('connected', mockUserP);
            expect(send_system).not.toHaveBeenCalled();
        });
    });
});
