/** ブラウザー統計のうち、音声表示・経路参照・障害要約で使う項目。 */
export type RtcStatsRecord = RTCStats & {
    kind?: string;
    isRemote?: boolean;
    bytesSent?: number;
    bytesReceived?: number;
    packetsSent?: number;
    packetsLost?: number;
    packetsReceived?: number;
    jitter?: number;
    transportId?: string;
    selectedCandidatePairId?: string;
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

/** ブラウザー境界のnullポートを、アプリ内の欠損表現へ揃える。 */
export function normalizeRtcStatsRecord(stats: RTCStats): RtcStatsRecord {
    const record: RawRtcStatsRecord = stats;
    return { ...record, port: record.port ?? undefined };
}

/**
 * 音声RTP → transport → 選択候補ペアの標準参照を、表示と障害診断で共有する。
 * RTPがない初期失敗時だけ一意のtransportを使い、参照欠落・複数音声経路は推測しない。
 */
export function selectedAudioCandidatePair(report: RTCStatsReport): RtcStatsRecord | undefined {
    const records = Array.from(report.values(), normalizeRtcStatsRecord);
    const rtp = records.filter((record) => record.type.endsWith("-rtp"));
    let transport: RtcStatsRecord | undefined;
    if (rtp.length > 0) {
        const audio = rtp.filter(
            (record) =>
                (record.type === "inbound-rtp" || record.type === "outbound-rtp") &&
                record.kind === "audio" &&
                !record.isRemote,
        );
        const ids = new Set(audio.map((record) => record.transportId));
        if (ids.size !== 1 || ids.has(undefined)) return undefined;
        transport = records.find((record) => record.type === "transport" && ids.has(record.id));
    } else {
        const transports = records.filter((record) => record.type === "transport");
        if (transports.length !== 1) return undefined;
        transport = transports[0];
    }
    if (!transport?.selectedCandidatePairId) return undefined;
    return records.find(
        (record) =>
            record.type === "candidate-pair" && record.id === transport.selectedCandidatePairId,
    );
}
