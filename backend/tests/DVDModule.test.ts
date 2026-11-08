import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DVDModule } from '../src/commands/DVDModule.js';
import { PlaylistModule } from '../src/commands/PlaylistModule.js';
import { EventEmitter } from 'events';

describe('DVDModule', () => {
    let module: DVDModule;
    let mockPlMod: PlaylistModule;
    let mockState: any;

    beforeEach(() => {
        mockPlMod = {
            qtys: {},
            currentPrice: 10
        } as any;
        module = new DVDModule(mockPlMod);
        mockState = {
            events: new EventEmitter(),
            usersPriv: new Map()
        };
        module.attach({ state: {}, runtime: mockState } as any);
    });

    it('should not trigger if user points below threshold', () => {
        const spy = vi.spyOn(Math, 'random');
        mockPlMod.qtys['1.1.1.1'] = 10; // Threshold is 4 * 10 = 40
        const user = { ipaddr: '1.1.1.1' };

        mockState.events.emit('joined', user, {}, {});

        // Should not roll check
        expect(spy).not.toHaveBeenCalled();
    });

    it('should trigger tax if points high and roll successful', () => {
        const randomSpy = vi.spyOn(Math, 'random');
        // First call checks trigger probability (needs < 0.125), return 0.1
        // Second call calculates drop amount factor (0.85 + rand*0.5). let's say rand=0.
        randomSpy.mockReturnValueOnce(0.1).mockReturnValueOnce(0);

        const richIp = '1.1.1.1';
        const poorIp = '2.2.2.2';

        mockPlMod.qtys[richIp] = 100; // > 40
        mockPlMod.qtys[poorIp] = 0;

        const richUser = { ipaddr: richIp, conn: { send: vi.fn() } };
        const poorUser = { ipaddr: poorIp, conn: { send: vi.fn() } };

        mockState.usersPriv.set(1, richUser);
        mockState.usersPriv.set(2, poorUser);

        mockState.events.emit('joined', richUser, {}, {});

        // Drop calculation:
        // drop = (100 * 0.33) * (0.85 + 0) = 33 * 0.85 = 28.05 -> ceil = 29

        expect(mockPlMod.qtys[richIp]).toBeLessThan(100);
        expect(mockPlMod.qtys[poorIp]).toBeGreaterThan(0);

        // Check redistribution logic
        // The one who joined loses points
        // THe poorest gains points
    });

    it('should not tax if roll fails', () => {
        const randomSpy = vi.spyOn(Math, 'random');
        randomSpy.mockReturnValue(0.5); // > 0.125

        mockPlMod.qtys['1.1.1.1'] = 100;
        const user = { ipaddr: '1.1.1.1' };

        mockState.events.emit('joined', user, {}, {});

        expect(mockPlMod.qtys['1.1.1.1']).toBe(100);
    });
});
