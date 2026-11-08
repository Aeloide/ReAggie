//import type { Collection } from "mongodb";
//import { Binary } from "bson";
//import * as mongo from "mongodb";

import { Binary } from "mongodb";
import { isIPv4 } from "net";

export const expandIPv6Address = (ipv6: string): string => {
    let segments = ipv6.split(':');

    const abbIndex = segments.indexOf('');
    if (abbIndex !== -1) {
        const segmentsBefore = segments.slice(0, abbIndex).filter(Boolean);
        const segmentsAfter = segments.slice(abbIndex + 1).filter(Boolean);
        const missingSegments = 8 - (segmentsBefore.length + segmentsAfter.length);
        segments = [
            ...segmentsBefore,
            ...Array(missingSegments).fill('0000'),
            ...segmentsAfter
        ];
    } else {
        segments = segments.filter(Boolean);
    }

    const lastSegment = segments[segments.length - 1];
    if (lastSegment.includes('.')) {
        const octets = lastSegment.split('.').map(Number);
        if (octets.length !== 4) throw new Error("Invalid IPv4-mapped IPv6 format");

        const ipv4AsHex = [
            ((octets[0] << 8) | octets[1]).toString(16).padStart(4, '0'),
            ((octets[2] << 8) | octets[3]).toString(16).padStart(4, '0')
        ];

        segments.splice(segments.length - 1, 1, ...ipv4AsHex);
    }

    return segments.map(segment => segment.padStart(4, '0')).join(':');
};

export const ipv6ToBigInt = (ipv6: string) => {
    const segments = ipv6.split(':');
    let result = 0n;

    for (let i = 0; i < segments.length; i++) {
        const segmentValue = parseInt(segments[i], 16);
        const shift = BigInt((segments.length - 1 - i) << 4);
        result += BigInt(segmentValue) << shift;
    }

    return result;
};

export const ipv4ToInt = (ipv4: string) => {
    const segments = ipv4.split('.');
    let result = 0;

    for (let i = 0; i < segments.length; i++) {
        result *= 256;
        result += parseInt(segments[i]);
    }

    return BigInt(result);
};
const genRange = (bs: bigint) => (ipv6n: bigint, range: bigint) => {
    const size = 1n << (bs - range);
    let prefix = ipv6n & ~(size - 1n);
    const remaining = prefix + size;
    return [prefix, remaining - 1n];
};

export const genRangev6 = genRange(128n);

export const genRangev4 = genRange(32n);

export const ipTo128bin = (low: number | bigint) => new Binary(Buffer.from(low.toString(16).padStart(32, '0'), "hex"), Binary.SUBTYPE_USER_DEFINED);

export const good_day = (ip: string) => {
    const v = isIPv4(ip) ? 4 : 6;
    const conv = v == 4 ? ipv4ToInt : (s: string) => ipv6ToBigInt(expandIPv6Address(s));
    const gen = v == 4 ? genRangev4 : genRangev6;
    const r = BigInt(v == 4 ? 24 : 64);
    return gen(conv(ip), r)[0];
}