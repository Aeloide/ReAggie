import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    insertOne: vi.fn(),
    axiosPost: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
    alertsc: {
        insertOne: mocks.insertOne,
    },
    Token: {},
}));

vi.mock('axios', () => ({
    default: {
        post: mocks.axiosPost,
    },
}));

describe('sendAlert', () => {
    beforeEach(async () => {
        vi.resetModules();
        mocks.insertOne.mockReset();
        mocks.axiosPost.mockReset();
        mocks.insertOne.mockResolvedValue({ acknowledged: true });
        mocks.axiosPost.mockResolvedValue({ status: 200 });
        delete process.env.ALERT_WEBHOOK_URL;
        delete process.env.DOMAIN;
    });

    afterEach(() => {
        delete process.env.ALERT_WEBHOOK_URL;
    });

    it('stores alerts locally and does not post to dogars.org', async () => {
        const { sendAlert } = await import('../src/utils.js');
        await sendAlert('bot alert', 'room abc 1.2.3.4');

        expect(mocks.insertOne).toHaveBeenCalledWith(expect.objectContaining({
            sub: 'bot alert',
            com: 'room abc 1.2.3.4',
            source: 'server',
            read: false,
        }));
        expect(mocks.axiosPost).not.toHaveBeenCalled();
    });

    it('posts only to ALERT_WEBHOOK_URL when configured', async () => {
        process.env.ALERT_WEBHOOK_URL = 'https://example.test/hook';
        const { sendAlert } = await import('../src/utils.js');
        await sendAlert('hello', 'world');

        expect(mocks.axiosPost).toHaveBeenCalledTimes(1);
        expect(mocks.axiosPost).toHaveBeenCalledWith('https://example.test/hook', {
            sub: 'hello',
            com: 'world',
        });
        expect(String(mocks.axiosPost.mock.calls[0][0])).not.toContain('dogars.org');
    });
});
