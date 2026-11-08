export const estimateClockDrift = (
    serverSentAt: number,
    serverReceivedAt: number,
    clientReceivedAt: number
) => {
    const roundTripTime = serverReceivedAt - serverSentAt;
    if (roundTripTime < 0 || roundTripTime > 10_000
        || !Number.isFinite(roundTripTime) || !Number.isFinite(clientReceivedAt))
        return undefined;
    return clientReceivedAt - (serverSentAt + roundTripTime / 2);
};
