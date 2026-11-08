import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
// import { app } from '../src/api.js'; // Removed static import

// Define hoisted mocks
const mocks = vi.hoisted(() => ({
    mockFindOne: vi.fn(),
    mockInsertOne: vi.fn(),
    mockUpdateOne: vi.fn(),
    mockFind: vi.fn(),
    mockProject: vi.fn(),
    mockToArray: vi.fn(),
    mockCountDocuments: vi.fn(),
    mockInsertMany: vi.fn(),
    mockUpdateOneCond: vi.fn(),
    mockUpdateMany: vi.fn(),
}));

// Mock database
vi.mock('../src/db.js', () => ({
    bingoc: {
        findOne: mocks.mockFindOne,
        insertOne: mocks.mockInsertOne,
        updateOne: mocks.mockUpdateOne,
    },
    bingocondsc: {
        find: mocks.mockFind.mockReturnValue({
            toArray: mocks.mockToArray,
            project: mocks.mockProject.mockReturnValue({
                toArray: mocks.mockToArray
            })
        }),
        countDocuments: mocks.mockCountDocuments,
        insertMany: mocks.mockInsertMany,
        updateOne: mocks.mockUpdateOneCond,
        updateMany: mocks.mockUpdateMany
    },
    // Mock other required exports from db.js to avoid runtime errors in api.ts
    banlist: {},
    clientPromise: Promise.resolve(),
    playerViews: {},
    playersc: { countDocuments: vi.fn() },
    publicWarns: {},
    reports: {},
    roomc: { estimatedDocumentCount: vi.fn() },
    asncapc: {},
    warnlist: {},
    intentc: {},
    badgoys: {},
    goodgoys: {},
    forbidden: {},
    comicc: { findOne: vi.fn() },
    failedRequests: {},
    tokensc: {},
    followersc: {},
    rearmNotificationTimer: vi.fn(),
    FollowPermissions: {},
    alertsc: {
        insertOne: vi.fn(),
        find: vi.fn(),
        countDocuments: vi.fn(),
        updateOne: vi.fn(),
        updateMany: vi.fn(),
        deleteOne: vi.fn(),
        createIndex: vi.fn(),
    },
}));

// Mock other dependencies
vi.mock('../src/utils.js', () => ({
    getGitHeadCommitHash: () => 'test',
    getIp: () => '127.0.0.1',
    getAsn: () => 0,
    randstring: () => 'randomtoken',
    // add other used utils
    buffToIpv4: vi.fn(),
    buffToIpv6: vi.fn(),
    buildBinaryRepr: vi.fn(),
    buildCapString: vi.fn(),
    persistAlert: vi.fn(),
    sendAlert: vi.fn(),
    findInList: vi.fn(),
    initAsnReaders: vi.fn(),
    nonRetardedAsyncExists: vi.fn(),
    extract_caphmac: vi.fn(),
    Permissions: class { },
}));

vi.mock('../src/server-ipc.js', () => ({
    roomExec: {},
    roomInfos: {},
    roomStats: {},
    rooms: {}
}));

vi.mock('../src/commands/index.js', () => ({
    spawnPromise: vi.fn().mockResolvedValue('output')
}));

vi.mock('../src/main.js', () => ({
    delegateRequest: vi.fn(),
    startRoomProcess: vi.fn()
}));

vi.mock('web-push', () => ({
    default: {
        setVapidDetails: vi.fn(),
        sendNotification: vi.fn()
    }
}));

vi.mock('../src/oauth-strats/twitch.js', () => ({
    default: class MockTwitchStrategy {
        name = 'twitch';
    }
}));

vi.mock('passport-discord', () => ({
    Strategy: class MockDiscordStrategy {
        name = 'discord';
    }
}));

vi.mock('connect-mongo', () => ({
    default: class MockMongoStore {
        constructor() { }
        on() { return this; }
    }
}));

vi.mock('../src/AssetManager.js', () => ({
    saveAsset: vi.fn()
}));



// ... (previous mocks remain)

describe('Bingo API', () => {
    let app: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset default mock returns
        mocks.mockFindOne.mockResolvedValue(null);
        mocks.mockInsertOne.mockResolvedValue({ acknowledged: true });
        mocks.mockUpdateOne.mockResolvedValue({ acknowledged: true });
        mocks.mockCountDocuments.mockResolvedValue(100); // assume seeded
        mocks.mockToArray.mockResolvedValue([]);

        // Dynamic import to ensure mocks are applied
        const apiModule = await import('../src/api.js');
        app = apiModule.app;
    });

    it('GET /api/bingo without token should create a new card', async () => {
        // Mock sufficient conditions
        const conditions = Array.from({ length: 30 }, (_, i) => ({ id: `cond${i}`, desc: `Condition ${i}` }));
        mocks.mockToArray.mockResolvedValue(conditions);

        const res = await request(app).get('/api/bingo');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body).toHaveProperty('grid');
        expect(res.body.grid).toHaveLength(25);
        expect(mocks.mockInsertOne).toHaveBeenCalled();
    });


    it('GET /api/bingo with existing token should return card', async () => {
        const token = 'existing-token';
        const card = {
            token,
            grid_ids: ['1'],
            created_at: new Date()
        };
        mocks.mockFindOne.mockResolvedValue(card);
        // Mock condition lookup
        mocks.mockToArray.mockResolvedValue([{ id: '1', desc: 'Test', checked: false }]);

        const res = await request(app).get('/api/bingo').query({ token });

        expect(res.status).toBe(200);
        expect(res.body.token).toBe(token);
        expect(res.body.grid).toHaveLength(1);
    });

    it('GET /api/bingoconds should return all conditions', async () => {
        const conditions = [{ id: '1', desc: 'test' }];
        mocks.mockToArray.mockResolvedValue(conditions);

        const res = await request(app).get('/api/bingoconds');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(conditions);
    });

    it('PATCH /api/bingo should update grid layout', async () => {
        const token = 'test-token';
        const oldCard = { token, grid_ids: [] };
        mocks.mockFindOne.mockResolvedValue(oldCard);

        // Setup mock conditions for validation
        const grid_ids = Array.from({ length: 25 }, (_, i) => `c${i}`);
        const dbConditions = grid_ids.map(id => ({ id, desc: `Desc ${id}` }));
        mocks.mockToArray.mockResolvedValue(dbConditions);

        const res = await request(app)
            .patch('/api/bingo')
            .send({ token, grid_ids });

        expect(res.status).toBe(200);
        expect(mocks.mockUpdateOne).toHaveBeenCalledWith(
            { token },
            { $set: { grid_ids: expect.any(Array), edited: true } }
        );
        // Verify the inserted grid has correct structure
        const updateCall = mocks.mockUpdateOne.mock.calls[0];
        const insertedGrid = updateCall[1].$set.grid_ids;
        expect(insertedGrid).toHaveLength(25);
        expect(insertedGrid[0]).toBe('c0');
    });

    it('PATCH /api/bingo should fail with invalid grid size', async () => {
        const res = await request(app)
            .patch('/api/bingo')
            .send({ token: 't', grid_ids: ['1', '2'] }); // Not 25

        expect(res.status).toBe(400);
    });

    it('POST /api/bingoimg should upload image', async () => {
        const token = 'winner-token';
        const grid_ids = Array.from({ length: 25 }, (_, i) => `win${i}`);
        const card = {
            token,
            grid_ids // winning grid
        };
        mocks.mockFindOne.mockResolvedValue(card);

        // Mock conditions with checked=true
        const conditions = grid_ids.map(id => ({ id, desc: 'win', checked: true }));
        mocks.mockToArray.mockResolvedValue(conditions);

        const res = await request(app)
            .post('/api/bingoimg')
            .field('token', token)
            .attach('file', Buffer.from('fake image'), 'reward.png');

        expect(res.status).toBe(200);
        expect(mocks.mockUpdateOne).toHaveBeenCalledWith(
            { token },
            { $set: { image: expect.stringMatching(/^\/bingo_rewards\//) } }
        );
    });

    it('unlockBingoCondition should unlock a locked condition and reset if <= 25 left', async () => {
        const apiModule = await import('../src/api.js');
        const { unlockBingoCondition } = apiModule;

        // Setup mock: 27 unchecked conditions
        const uncheckedConds = Array.from({ length: 27 }, (_, i) => ({ id: `cond-${i}`, desc: `Cond ${i}`, checked: false }));
        mocks.mockToArray.mockResolvedValue(uncheckedConds);

        await unlockBingoCondition();

        // Should have updated one condition to checked = true
        expect(mocks.mockUpdateOneCond).toHaveBeenCalledWith(
            { id: expect.stringMatching(/^cond-/) },
            { $set: { checked: true } }
        );

        // Since remaining unchecked count (27 - 1 = 26) > 25, updateMany (reset) should NOT be called
        expect(mocks.mockUpdateMany).not.toHaveBeenCalled();

        // Reset mocks for next run
        mocks.mockUpdateOneCond.mockClear();
        mocks.mockUpdateMany.mockClear();

        // Setup mock: 26 unchecked conditions (so after unlocking one, exactly 25 are left)
        const uncheckedCondsReset = Array.from({ length: 26 }, (_, i) => ({ id: `cond-${i}`, desc: `Cond ${i}`, checked: false }));
        mocks.mockToArray.mockResolvedValue(uncheckedCondsReset);

        await unlockBingoCondition();

        // Should have updated one condition to checked = true
        expect(mocks.mockUpdateOneCond).toHaveBeenCalled();

        // Since remaining unchecked count (26 - 1 = 25) <= 25, updateMany (reset) should be called to set checked = false
        expect(mocks.mockUpdateMany).toHaveBeenCalledWith({}, { $set: { checked: false } });
    });
});
