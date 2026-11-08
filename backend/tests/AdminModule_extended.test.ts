import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdminModule } from '../src/commands/AdminModule.js';
import { Permissions } from '../src/utils.js';
import { send_system } from '../src/room-utils.js';
import { EventEmitter } from 'events';

vi.mock('../src/db.js', () => ({
    goodgoys: { some: 'list' },
    roomc: { deleteOne: vi.fn() },
    trashupRoom: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn(),
    sendAlert: vi.fn(),
    pruneuser: vi.fn((s, r, rm, u, cb) => cb({ close: vi.fn() }))
}));

vi.mock('../src/utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/utils.js')>();
    return {
        ...actual,
        buildCapString: vi.fn().mockReturnValue('mock-cap-string'),
        findInList: vi.fn(),
    }
});

// Mock process.exit
const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);

describe('AdminModule Extended', () => {
    let module: AdminModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;
    let mockUser2: any;
    let mockUserP2: any;

    beforeEach(() => {
        module = new AdminModule();
        mockState = {
            broadcaster: {
                broadcast: vi.fn(),
                broadcast_slow: vi.fn(),
                broadcastRoomUsers: vi.fn()
            },
            usersPriv: new Map(),
            users: [],
            modules: [],
            getStatsMessage: vi.fn(),
            sendInfos: vi.fn(),
            reEvalHardbans: vi.fn(),
            hidlog: [],
            events: new EventEmitter(),
            createdBy: 'someone'
        };

        mockRoom = {
            ext: {}
        };

        mockUser = {
            name: 'testUser',
            color: '#000000',
            id: 1
        };

        mockUserP = {
            host: {}, // capabilities
            ishost: new Permissions(),
            conn: { send: vi.fn(), close: vi.fn() },
            ipaddr: '127.0.0.1',
            user: mockUser,
            muter: { mutedUsers: new Set(), addClause: vi.fn(), removeClause: vi.fn(), shouldMute: vi.fn() }
        };

        mockUser2 = {
            name: 'targetUser',
            color: '#ffffff',
            id: 2
        };

        mockUserP2 = {
            host: {},
            ishost: new Permissions(),
            conn: { send: vi.fn(), close: vi.fn() },
            ipaddr: '127.0.0.2',
            user: mockUser2,
            muter: { mutedUsers: new Set(), addClause: vi.fn(), removeClause: vi.fn(), shouldMute: vi.fn() }
        };

        mockState.usersPriv.set(1, mockUserP);
        mockState.usersPriv.set(2, mockUserP2);
        mockState.usersPriv.set('2', mockUserP2); // Safe fallback for loose lookups
        mockState.users.push(mockUser);
        mockState.users.push(mockUser2);

        // Attach
        module.attach({ state: mockState, runtime: mockState } as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('whisper commands', () => {
        it('should whisper to target user by name', () => {
            const cmd = module.commands.find(c => c.name === 'whisper');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, 'targetUser;hello');

            expect(mockUserP.conn.send).toHaveBeenCalled(); // Echo back
            expect(mockUserP2.conn.send).toHaveBeenCalled(); // Received
            expect(mockState.hidlog.length).toBe(1);
        });

        it('should not whisper if user not found', () => {
            const cmd = module.commands.find(c => c.name === 'whisper');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, 'unknownUser;hello');

            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, expect.stringContaining('No such user'));
        });

        it('should whisper to target user by id', () => {
            const cmd = module.commands.find(c => c.name === 'whisperid');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '2;hello');

            expect(mockUserP.conn.send).toHaveBeenCalled();
            expect(mockUserP2.conn.send).toHaveBeenCalled();
        });

        it('should whisper to group', () => {
            const cmd = module.commands.find(c => c.name === 'whispergid');
            // Mock RPC arg format
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, ['2'] as any, 'hello group');

            expect(mockUserP2.conn.send).toHaveBeenCalled();
            expect(mockState.hidlog.length).toBe(1);
        });

        it('should handle partial group failures', () => {
            const cmd = module.commands.find(c => c.name === 'whispergid');
            // Target 2 (exists) and 3 (does not)
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, ['2', '3'] as any, 'hello group');

            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, expect.stringContaining('Some users were not found'));
        });
    });

    describe('auth command', () => {
        it('should grant admin if password correct', () => {
            process.env.MONGOPASS = 'testpass';
            const cmd = module.commands.find(c => c.name === 'auth');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, 'testpass');

            expect(mockUserP.ishost.has('Admin')).toBe(true);
            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, 'Success.');
            expect(mockState.broadcaster.broadcastRoomUsers).toHaveBeenCalled();
        });

        it('should do nothing if password incorrect', () => {
            process.env.MONGOPASS = 'testpass';
            const cmd = module.commands.find(c => c.name === 'auth');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, 'wrongpass');

            expect(mockUserP.ishost.has('Admin')).toBe(false);
        });
    });

    describe('s command', () => {
        it('should send silent message to hidlog and broadcast', () => {
            const cmd = module.commands.find(c => c.name === 's');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, 'secret message');

            expect(mockState.hidlog.length).toBe(1);
            expect(mockState.broadcaster.broadcast_slow).toHaveBeenCalled();
        });
    });

    describe('banlist command', () => {
        it('should show banlist if user has ReadBanlist cap', () => {
            mockUserP.host = { ReadBanlist: true };
            mockState.bannedips = ['1.2.3.4'];
            const cmd = module.commands.find(c => c.name === 'banlist');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, '1.2.3.4');
        });

        it('should deny if user lacks ReadBanlist cap', () => {
            mockUserP.host = { ReadBanlist: false };
            const cmd = module.commands.find(c => c.name === 'banlist');
            const res = cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(res).toBe(false);
        });
    });

    describe('ids command', () => {
        it('should list user ids if debug', () => {
            mockUserP.host = { Debug: true };
            const cmd = module.commands.find(c => c.name === 'ids');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, expect.stringContaining('testUser: 1'));
        });
    });

    describe('botnet command', () => {
        it('should send botnet packet to target if debug', () => {
            mockUserP.host = { Debug: true };
            const cmd = module.commands.find(c => c.name === 'botnet');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '2');

            expect(mockUserP2.conn.send).toHaveBeenCalledWith(expect.stringContaining('"type":"botnet"'));
        });

        it('should fail if user not found', () => {
            mockUserP.host = { Debug: true };
            const cmd = module.commands.find(c => c.name === 'botnet');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '99');

            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, expect.stringContaining('No such user'));
        });
    });

    describe('delegateid / mod / modid command', () => {
        it('should delegate capabilities', () => {
            mockUserP.host = { Delegate: true, Kick: true };
            mockUserP.ishost = new Permissions(['Admin', 'Kick', 'Delegate']);

            const cmd = module.commands.find(c => c.name === 'delegateid');
            const someCap = 'Kick';

            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, someCap, '2');

            expect(mockUserP2.conn.send).toHaveBeenCalledWith(expect.stringContaining('"type":"upgrade"'));
            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, 'Success.');
        });

        it('should fail if user cannot delegate', () => {
            mockUserP.host = { Delegate: false };
            const cmd = module.commands.find(c => c.name === 'delegateid');
            const res = cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '1', '2');
            expect(res).toBe(false);
        });

        it('should fail if user not found', () => {
            mockUserP.host = { Delegate: true };
            const cmd = module.commands.find(c => c.name === 'delegateid');
            const res = cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '1', '99');
            // returns true but sends system message
            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, expect.stringContaining("find this user"));
        });

        it('mod command should delegate RoomCreator', () => {
            mockUserP.host = { Delegate: true };
            mockUserP.ishost = new Permissions(['RoomCreator', 'Delegate']);

            const cmd = module.commands.find(c => c.name === 'mod');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, 'targetUser');

            expect(mockUserP2.conn.send).toHaveBeenCalledWith(expect.stringContaining('"type":"upgrade"'));
        });

        it('modid command should delegate RoomCreator by id', () => {
            mockUserP.host = { Delegate: true };
            mockUserP.ishost = new Permissions(['RoomCreator', 'Delegate']);

            const cmd = module.commands.find(c => c.name === 'modid');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any, '2');

            expect(mockUserP2.conn.send).toHaveBeenCalledWith(expect.stringContaining('"type":"upgrade"'));
        });
    });

    describe('slowmode command', () => {
        it('should toggle slow mode', () => {
            mockUserP.host = { SlowMode: true };
            const cmd = module.commands.find(c => c.name === 'slowmode');

            // Enable
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(mockState.slow).toBeDefined();
            expect(mockState.slow.baseTimeout).toBe(15);

            // Disable
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);
            expect(mockState.slow).toBeUndefined();
        });
    });



    describe('endstats command', () => {
        it('should send endstats', () => {
            mockState.endstats = { some: 'stats' };
            const cmd = module.commands.find(c => c.name === 'endstats');
            cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            expect(mockUserP.conn.send).toHaveBeenCalledWith(expect.stringContaining('"type":"endstats"'));
        });
    });

    describe('del command', () => {
        it('should trash room and exit', async () => {
            process.argv[2] = 'test-room-id';

            mockUserP.host = { Delete: true };
            const cmd = module.commands.find(c => c.name === 'del');
            await cmd!.handler({ state: mockState, runtime: mockState, room: mockRoom, userp: mockUserP, user: mockUser } as any);

            // Wait for promise resolution in handler
            await new Promise(r => setTimeout(r, 0));

            expect(exitSpy).toHaveBeenCalledWith(0);
        });
    });



    describe('Connections restrictions', () => {
        it('should throw when locked and user is not host', () => {
            module.locked = true;
            mockUserP2.host.Lock = false; // Not authorized

            expect(() => {
                mockState.events.emit('connected', mockUserP2);
            }).toThrow('Room is locked');
        });

        it('should not throw when locked and user is authorized', () => {
            module.locked = true;
            mockUserP2.host.Lock = true;

            expect(() => {
                mockState.events.emit('connected', mockUserP2);
            }).not.toThrow();
        });

        it('should throw when superlocked and user is not admin', () => {
            module.superlocked = true;
            mockUserP2.host.Admin = false;

            expect(() => {
                mockState.events.emit('connected', mockUserP2);
            }).toThrow('Room is pending verification');
        });
    });
});
