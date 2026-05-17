export type RtcStatsRecord = RTCStats & {
    kind?: string;
    isRemote?: boolean;
    bytesSent?: number;
    bytesReceived?: number;
    packetsSent?: number;
    packetsLost?: number;
    packetsReceived?: number;
    jitter?: number;
    selected?: boolean;
    nominated?: boolean;
    state?: string;
    localCandidateId?: string;
    remoteCandidateId?: string;
    currentRoundTripTime?: number;
    availableOutgoingBitrate?: number;
    candidateType?: string;
    protocol?: string;
    relayProtocol?: string;
    address?: string;
    ip?: string;
    port?: number | string;
};

type RawRtcStatsRecord = Omit<RtcStatsRecord, "port"> & {
    port?: number | string | null;
};

export function normalizeRtcStatsRecord(stats: RTCStats): RtcStatsRecord {
    const record: RawRtcStatsRecord = stats;
    return { ...record, port: record.port ?? undefined };
}
