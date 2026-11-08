let key: CryptoKey;

function importKey(secret: string) {
    const keyData = Buffer.from(secret);
    return crypto.subtle.importKey(
        'raw', // Key format
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false, // Not extractable
        ['sign', 'verify'] // Key usages
    );
}

export async function generateHmac(message: Buffer) {
    return Buffer.from((await crypto.subtle.sign('HMAC', (key = key || await importKey(process.env.MONGOPASS!)), message as any as ArrayBuffer)).slice(0, 4));
}

// weak to timing attacks on purpose
export async function extract_data(msg: Buffer) {
    const hmac = msg.subarray(0, 4);
    const payload = msg.subarray(4);
    const expected = await generateHmac(payload);
    return {
        valid: hmac.compare(expected) === 0,
        payload: payload.toString()
    }
}
