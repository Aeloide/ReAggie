import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoteKickModule } from '../src/commands/VoteKickModule.js';
import { send_system, banuser } from '../src/room-utils.js';

vi.mock('../src/room-utils.js', () => ({
    send_system: vi.fn(),
    banuser: vi.fn(),
}));

describe('VoteKickModule Extended', () => {
    let module: VoteKickModule;
    let mockState: any;
    let mockRoom: any;
    let mockUserP: any;
    let mockUser: any;
    let mockUser2: any;
    let mockUserP2: any;

    beforeEach(() => {
        vi.clearAllMocks();
        module = new VoteKickModule();
        mockState = {
            broadcaster: { broadcast: vi.fn() },
            usersPriv: new Map(),
            users: [],
            bannedips: [],
            events: { on: vi.fn() },
        };
        mockRoom = {
            votekick: true,
            groups: []
        };
        mockUser = { id: 1, name: 'user1', color: '#000' };
        mockUserP = {
            conn: { send: vi.fn() },
            ipaddr: '127.0.0.1',
            user: mockUser,
            ishost: 0
        };

        mockUser2 = { id: 2, name: 'target', color: '#fff' };
        mockUserP2 = {
            conn: { send: vi.fn() },
            ipaddr: '127.0.0.2',
            user: mockUser2,
            host: {}, // capabilities
            ishost: 0
        };

        mockState.usersPriv.set(1, mockUserP);
        mockState.usersPriv.set(2, mockUserP2);
        mockState.users.push(mockUser);
        mockState.users.push(mockUser2);

        module.attach({ room: mockRoom, state: {}, runtime: mockState } as any);
    });

    describe('votekickid', () => {
        it('should fail if votekick disabled', () => {
            mockRoom.votekick = false;
            const cmd = module.commands.find(c => c.name === 'votekickid');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '2');
            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, 'Votekick is disabled.');
        });

        it('should fail if missing id', () => {
            const cmd = module.commands.find(c => c.name === 'votekickid');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any);
            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, 'Missing user id.');
        });

        it('should fail if invalid id', () => {
            const cmd = module.commands.find(c => c.name === 'votekickid');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '99');
            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, expect.stringContaining('Invalid user id'));
        });

        it('should fail if target is host/immune', () => {
            mockUserP2.host.KickImmune = true;
            const cmd = module.commands.find(c => c.name === 'votekickid');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '2');
            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, expect.stringContaining("Can't vote kick a host"));
        });

        it('should fail if already voted', () => {
            const cmd = module.commands.find(c => c.name === 'votekickid');
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '2');

            // Vote again
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '2');

            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, expect.stringContaining("already voted"));
        });

        it('should ban if votes sufficient', () => {
            // Add user 3 to reach vote threshold
            const u3 = { id: 3, name: 'u3' };
            const up3 = { ipaddr: '1.2.3.4', conn: { send: vi.fn() }, user: u3 };
            mockState.usersPriv.set(3, up3);
            mockState.users.push(u3);

            const cmd = module.commands.find(c => c.name === 'votekickid');

            // Vote 1
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, '2');

            expect(banuser).not.toHaveBeenCalled();

            // Vote 2 (from user 3)
            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: up3, user: u3 } as any, '2');

            expect(banuser).toHaveBeenCalledWith({}, mockState, mockRoom, mockUserP2, expect.stringContaining('votekick'), expect.anything());
        });
    });

    describe('votekick (by name/pieces)', () => {
        it('should vote by name match', () => {
            const cmd = module.commands.find(c => c.name === 'votekick');
            // Mock target user has most pieces to avoid fallback issues
            mockRoom.groups = [{ selected: 2 }];

            const handlerSpy = vi.spyOn(module, 'handleVoteKickId').mockImplementation(() => true);

            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, 'target');

            expect(handlerSpy).toHaveBeenCalledWith(expect.anything(), '2');
        });

        it('should vote by most pieces if name matches nothing', () => {
            const cmd = module.commands.find(c => c.name === 'votekick');
            // Target (id 2) has 1 piece. User 1 has 0.
            mockRoom.groups = [{ selected: 2 }];

            const handlerSpy = vi.spyOn(module, 'handleVoteKickId').mockImplementation(() => true);

            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any, 'nomatch');

            expect(handlerSpy).not.toHaveBeenCalled();
            expect(send_system).toHaveBeenCalledWith(mockUserP, mockUser, 'Could not find the user');
        });

        it('should vote by most pieces if no arg', () => {
            const cmd = module.commands.find(c => c.name === 'votekick');
            mockRoom.groups = [{ selected: 2 }, { selected: 2 }, { selected: 1 }]; // 2 has 2, 1 has 1.

            const handlerSpy = vi.spyOn(module, 'handleVoteKickId').mockImplementation(() => true);

            cmd!.handler({ room: mockRoom, state: {}, runtime: mockState, userp: mockUserP, user: mockUser } as any);

            expect(handlerSpy).toHaveBeenCalledWith(expect.anything(), '2');
        });
    });
});
