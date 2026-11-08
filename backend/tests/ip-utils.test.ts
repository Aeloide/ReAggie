import { describe, it, expect } from 'vitest';
import { expandIPv6Address, ipv6ToBigInt, ipv4ToInt, good_day } from '../src/ip-utils.js';
import { Binary } from 'mongodb';

describe('ip-utils', () => {
    describe('expandIPv6Address', () => {
        it('should expand shortened IPv6 address', () => {
            expect(expandIPv6Address('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
        });

        it('should handle full IPv6 address', () => {
            expect(expandIPv6Address('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
        });

        it('should handle IPv4-mapped IPv6 address', () => {
            expect(expandIPv6Address('::ffff:192.168.0.1')).toBe('0000:0000:0000:0000:0000:0000:ffff:c0a8:0001');
        });
    });

    describe('ipv4ToInt', () => {
        it('should convert IPv4 to BigInt', () => {
            expect(ipv4ToInt('192.168.0.1')).toBe(3232235521n);
        });
    });

    describe('ipv6ToBigInt', () => {
        it('should convert IPv6 to BigInt', () => {
            const result = ipv6ToBigInt('2001:0db8:0000:0000:0000:0000:0000:0001');
            expect(result).toBe(42540766411282592856903984951653826561n);
        });
    });

    describe('good_day', () => {
        it('should return range for IPv4', () => {
            // 24 bit subnet
            const low = good_day('192.168.1.100');
            const low2 = good_day('192.168.1.5');
            expect(low).toBe(low2);

            const low3 = good_day('192.168.2.1');
            expect(low).not.toBe(low3);
        });

        it('should return range for IPv6', () => {
            // 64 bit subnet
            const ip1 = '2001:db8:abcd:0012::1';
            const ip2 = '2001:db8:abcd:0012::5';
            const ip3 = '2001:db8:abcd:0013::1';

            const r1 = good_day(ip1);
            const r2 = good_day(ip2);
            const r3 = good_day(ip3);

            expect(r1).toBe(r2);
            expect(r1).not.toBe(r3);
        });
    });
});
