import { describe, it, expect, vi } from 'vitest';
import { TextProgress } from '../src/commands/Process.js';

describe('TextProgress', () => {
    it('should generate correct code', () => {
        const mockUser = { conn: { send: vi.fn() } } as any;
        const tp = new TextProgress(123, mockUser);
        tp.label = 'Testing';
        tp.value = 50;

        const code = tp.code();
        expect(code).toContain('<label>Testing</label>');
        expect(code).toContain('value="50"');
    });

    it('should send refresh message', () => {
        const sendMock = vi.fn();
        const mockUser = { conn: { send: sendMock } } as any;
        const tp = new TextProgress(123, mockUser);

        tp.refresh();
        expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('"type":"proc"'));
        expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('"id":123'));
    });

    it('should send clear message', () => {
        const sendMock = vi.fn();
        const mockUser = { conn: { send: sendMock } } as any;
        const tp = new TextProgress(456, mockUser);

        tp.clear();
        expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('"type":"remproc"'));
        expect(sendMock).toHaveBeenCalledWith(expect.stringContaining('"id":456'));
    });
});
