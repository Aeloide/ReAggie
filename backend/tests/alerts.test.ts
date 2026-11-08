import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';

const mocks = vi.hoisted(() => ({
    insertOne: vi.fn(),
    find: vi.fn(),
    sort: vi.fn(),
    limit: vi.fn(),
    toArray: vi.fn(),
    countDocuments: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    deleteOne: vi.fn(),
    persistAlert: vi.fn(),
    ip: '203.0.113.9',
}));

vi.mock('../src/db.js', () => ({
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
        insertOne: mocks.insertOne,
        find: mocks.find.mockReturnValue({
            sort: mocks.sort.mockReturnValue({
                limit: mocks.limit.mockReturnValue({
                    toArray: mocks.toArray,
                }),
            }),
        }),
        countDocuments: mocks.countDocuments,
        updateOne: mocks.updateOne,
        updateMany: mocks.updateMany,
        deleteOne: mocks.deleteOne,
        createIndex: vi.fn(),
    },
}));

vi.mock('../src/utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/utils.js')>();
    return {
        ...actual,
        persistAlert: mocks.persistAlert,
        sendAlert: vi.fn(),
        getGitHeadCommitHash: () => 'test',
        getIp: () => mocks.ip,
        getAsn: () => 0,
        randstring: () => 'randomtoken',
        initAsnReaders: vi.fn(),
        findInList: vi.fn(),
        spawnPromise: vi.fn().mockResolvedValue(Buffer.from('')),
    };
});

vi.mock('../src/server-ipc.js', () => ({
    roomExec: {},
    roomInfos: {},
    roomStats: {},
    rooms: {},
}));

vi.mock('../src/main.js', () => ({
    delegateRequest: vi.fn(),
    startRoomProcess: vi.fn(),
}));

vi.mock('web-push', () => ({
    default: {
        setVapidDetails: vi.fn(),
        sendNotification: vi.fn(),
    },
}));

vi.mock('../src/oauth-strats/twitch.js', () => ({
    default: class MockTwitchStrategy {
        name = 'twitch';
    },
}));

vi.mock('passport-discord', () => ({
    Strategy: class MockDiscordStrategy {
        name = 'discord';
    },
}));

vi.mock('connect-mongo', () => ({
    default: class MockMongoStore {
        constructor() { }
        on() { return this; }
    },
}));

vi.mock('../src/AssetManager.js', () => ({
    saveAsset: vi.fn(),
}));

describe('Alert inbox API', () => {
    let app: any;
    const adminPass = 'test-admin-pass';

    beforeEach(async () => {
        vi.clearAllMocks();
        process.env.MONGOPASS = adminPass;
        mocks.persistAlert.mockResolvedValue({ ok: true });
        mocks.toArray.mockResolvedValue([]);
        mocks.countDocuments.mockResolvedValue(0);
        mocks.updateOne.mockResolvedValue({ acknowledged: true });
        mocks.updateMany.mockResolvedValue({ acknowledged: true });
        mocks.deleteOne.mockResolvedValue({ acknowledged: true });
        const apiModule = await import('../src/api.js');
        app = apiModule.app;
    });

    it('POST /api/contact stores feedback locally with the client IP', async () => {
        const res = await request(app)
            .post('/api/contact')
            .send({ sub: 'room-1 - alice', com: 'great puzzle' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mocks.persistAlert).toHaveBeenCalledWith('room-1 - alice', 'great puzzle', {
            source: 'client',
            ip: mocks.ip,
        });
    });

    it('POST /api/contact rejects empty payloads', async () => {
        const res = await request(app)
            .post('/api/contact')
            .send({ sub: '   ', com: '' });
        expect(res.status).toBe(400);
        expect(mocks.persistAlert).not.toHaveBeenCalled();
    });

    it('POST /api/contact rate-limits a client', async () => {
        mocks.ip = '198.51.100.20';
        for (let i = 0; i < 8; i++) {
            const res = await request(app)
                .post('/api/contact')
                .send({ sub: `s${i}`, com: 'ok' });
            expect(res.status).toBe(200);
        }
        const res = await request(app)
            .post('/api/contact')
            .send({ sub: 's9', com: 'ok' });
        expect(res.status).toBe(429);
    });

    it('GET /api/alerts requires the admin password', async () => {
        const res = await request(app).get('/api/alerts');
        expect(res.status).toBe(401);
    });

    it('GET /api/alerts returns stored items for an admin', async () => {
        const id = new ObjectId();
        const item = {
            _id: id,
            time: new Date('2026-01-01T00:00:00Z'),
            sub: 'feedback',
            com: 'hello',
            source: 'client',
            ip: '203.0.113.9',
            read: false,
        };
        mocks.toArray.mockResolvedValue([item]);
        mocks.countDocuments.mockResolvedValue(1);

        const res = await request(app)
            .get('/api/alerts')
            .set('x-admin-pass', adminPass);

        expect(res.status).toBe(200);
        expect(res.body.unread).toBe(1);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0]._id).toBe(String(id));
        expect(res.body.items[0].sub).toBe('feedback');
    });

    it('PATCH /api/alerts/:id marks an alert read', async () => {
        const id = new ObjectId();
        const res = await request(app)
            .patch(`/api/alerts/${id}`)
            .set('x-admin-pass', adminPass)
            .send({ read: true });

        expect(res.status).toBe(200);
        expect(mocks.updateOne).toHaveBeenCalledWith({ _id: id }, { $set: { read: true } });
    });

    it('DELETE /api/alerts/:id removes an alert', async () => {
        const id = new ObjectId();
        const res = await request(app)
            .delete(`/api/alerts/${id}`)
            .set('x-admin-pass', adminPass);

        expect(res.status).toBe(200);
        expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: id });
    });

    it('POST /api/alerts/read-all marks every unread alert', async () => {
        const res = await request(app)
            .post('/api/alerts/read-all')
            .set('x-admin-pass', adminPass)
            .send({});

        expect(res.status).toBe(200);
        expect(mocks.updateMany).toHaveBeenCalledWith({ read: false }, { $set: { read: true } });
    });
});
