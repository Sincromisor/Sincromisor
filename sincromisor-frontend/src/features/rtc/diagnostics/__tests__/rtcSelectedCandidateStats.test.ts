import { afterEach, expect, it, vi } from "vitest";
import { frontendLogger } from "../../../../shared/logging/appLogger";
import { captureIceFailureDiagnostics } from "../rtcIceDiagnostics";
import type { RtcStatsRecord } from "../rtcStatsRecords";
import { RtcStatsReporter } from "../rtcStatsReporter";

// 古い選択情報を先頭へ残し、映像transportも音声より前へ置く。
function fixture(): Map<string, RtcStatsRecord> {
    const oldPair = {
        id: "old-pair",
        timestamp: 1,
        type: "candidate-pair" as const,
        state: "succeeded",
        nominated: true,
        selected: true,
        currentRoundTripTime: 0.5,
        localCandidateId: "old-local",
        remoteCandidateId: "old-remote",
    };
    const rows: RtcStatsRecord[] = [
        oldPair,
        {
            id: "video-transport",
            timestamp: 1,
            type: "transport",
            selectedCandidatePairId: "old-pair",
        },
        { id: "old-local", timestamp: 1, type: "local-candidate", candidateType: "host" },
        { id: "old-remote", timestamp: 1, type: "remote-candidate", candidateType: "host" },
        {
            id: "audio-out",
            timestamp: 1,
            type: "outbound-rtp",
            kind: "audio",
            transportId: "audio-transport",
            bytesSent: 100,
        },
        {
            id: "audio-in",
            timestamp: 1,
            type: "inbound-rtp",
            kind: "audio",
            transportId: "audio-transport",
            bytesReceived: 200,
        },
        {
            id: "video-out",
            timestamp: 1,
            type: "outbound-rtp",
            kind: "video",
            transportId: "video-transport",
        },
        {
            id: "audio-transport",
            timestamp: 1,
            type: "transport",
            selectedCandidatePairId: "current-pair",
        },
        {
            id: "current-pair",
            timestamp: 1,
            type: "candidate-pair",
            state: "succeeded",
            currentRoundTripTime: 0.01,
            availableOutgoingBitrate: 64000,
            localCandidateId: "local",
            remoteCandidateId: "remote",
        },
        {
            id: "local",
            timestamp: 1,
            type: "local-candidate",
            candidateType: "relay",
            protocol: "udp",
            address: "fixture-local",
            port: 1234,
        },
        {
            id: "remote",
            timestamp: 1,
            type: "remote-candidate",
            candidateType: "srflx",
            protocol: "udp",
            address: "fixture-remote",
            port: 5678,
        },
        { id: "failed-pair", timestamp: 1, type: "candidate-pair", state: "failed" },
    ];
    return new Map(rows.map((row) => [row.id, row]));
}

async function observe(report: RTCStatsReport) {
    const metrics = new Map<string, string>();
    const logger = {
        addRtcEventLog: vi.fn(),
        pushTrendPoint: vi.fn(),
        updateMetricValue: (key: string, value: string) => metrics.set(key, value),
    };
    const peer = {
        getStats: async () => report,
        signalingState: "stable",
        iceGatheringState: "complete",
    } as const;
    const record = vi.spyOn(frontendLogger.diagnostics, "record").mockImplementation(() => {});
    vi.stubGlobal("navigator", { userAgent: "fixture-agent" });
    // 表示処理が利用するブラウザー境界はgetStatsだけ。
    await new RtcStatsReporter(logger).collectAndRender(peer as unknown as RTCPeerConnection); // reason: 実通信せず固定RTCStatsReportを表示処理へ渡す。
    await captureIceFailureDiagnostics({ peerConnection: peer, reason: "failed", logger });
    return { metrics, summary: record.mock.calls[record.mock.calls.length - 1][2]?.ice_summary };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it.each([false, true])(
    "統計順の反転=%sでも音声が参照する現在の候補を表示・診断する",
    async (reverse) => {
        const rows = fixture();
        const report = reverse ? new Map([...rows].reverse()) : rows;
        const { metrics, summary } = await observe(report);
        expect(metrics.get("rtcRoundTripTime")).toBe("10.0 ms");
        expect(metrics.get("rtcCandidatePair")).toBe("relay -> srflx");
        expect(metrics.get("rtcTransportProtocol")).toBe("udp");
        expect(metrics.get("rtcLocalCandidate")).toBe("fixture-local:1234 (relay/udp)");
        expect(metrics.get("rtcRemoteCandidate")).toBe("fixture-remote:5678 (srflx/udp)");
        expect(metrics.get("rtcAvailableOutgoingBitrate")).toBe("64.0 kbps");
        expect(summary).toMatchObject({
            rtt_ms: 10,
            local_type: "relay",
            remote_type: "srflx",
            pair_count: 3,
            succeeded_pair_count: 2,
        });
        expect(JSON.stringify(summary)).not.toMatch(/fixture-|current-pair|1234|5678/);
    },
);

const unavailable: { name: string; change: (rows: Map<string, RtcStatsRecord>) => void }[] = [
    {
        name: "選択IDなし",
        change: (rows) => {
            const row = rows.get("audio-transport");
            if (row) delete row.selectedCandidatePairId;
        },
    },
    {
        name: "選択ペア欠落",
        change: (rows) => {
            rows.delete("current-pair");
        },
    },
    {
        name: "transport欠落",
        change: (rows) => {
            rows.delete("audio-transport");
        },
    },
    {
        name: "音声のtransportIdなし",
        change: (rows) => {
            const row = rows.get("audio-out");
            if (row) delete row.transportId;
        },
    },
    {
        name: "複数の音声経路",
        change: (rows) => {
            const row = rows.get("audio-in");
            if (row) row.transportId = "video-transport";
        },
    },
    {
        name: "RTPなし・複数transport",
        change: (rows) => {
            for (const id of ["audio-out", "audio-in", "video-out"]) rows.delete(id);
        },
    },
    {
        name: "映像RTPのみ",
        change: (rows) => {
            rows.delete("audio-out");
            rows.delete("audio-in");
        },
    },
    {
        name: "選択先の種別不一致",
        change: (rows) => {
            const row = rows.get("audio-transport");
            if (row) row.selectedCandidatePairId = "local";
        },
    },
    {
        name: "transport参照先の種別不一致",
        change: (rows) => {
            const row = rows.get("audio-transport");
            if (row) row.type = "candidate-pair";
        },
    },
];
it.each(unavailable)("$nameでは旧候補から補わない", async ({ change }) => {
    const rows = fixture();
    change(rows);
    const { metrics, summary } = await observe(rows);
    for (const key of [
        "rtcRoundTripTime",
        "rtcCandidatePair",
        "rtcTransportProtocol",
        "rtcLocalCandidate",
        "rtcRemoteCandidate",
        "rtcAvailableOutgoingBitrate",
    ])
        expect(metrics.get(key)).toBe("-");
    expect(summary?.rtt_ms).toBeUndefined();
    expect(summary?.local_type).toBeUndefined();
    expect(summary?.remote_type).toBeUndefined();
    expect(summary?.pair_state).toBeUndefined();
});

it("RTPなし・一意のtransportなら接続失敗時も使用経路を取得する", async () => {
    const rows = fixture();
    for (const id of ["audio-out", "audio-in", "video-out", "video-transport"]) rows.delete(id);
    const { metrics, summary } = await observe(rows);
    expect(metrics.get("rtcRoundTripTime")).toBe("10.0 ms");
    expect(summary?.rtt_ms).toBe(10);
});

it.each(["local", "remote"])("%s候補欠落では取得できた項目を残す", async (missing) => {
    const rows = fixture();
    rows.delete(missing);
    const { metrics, summary } = await observe(rows);
    expect(metrics.get("rtcRoundTripTime")).toBe("10.0 ms");
    expect(summary?.rtt_ms).toBe(10);
    expect(metrics.get(missing === "local" ? "rtcLocalCandidate" : "rtcRemoteCandidate")).toBe("-");
    expect(metrics.get(missing === "local" ? "rtcRemoteCandidate" : "rtcLocalCandidate")).not.toBe(
        "-",
    );
    expect(summary?.local_type).toBe(missing === "local" ? undefined : "relay");
    expect(summary?.remote_type).toBe(missing === "remote" ? undefined : "srflx");
});

it("再収集で選択IDが消えたら以前の経路表示を残さない", async () => {
    const rows = fixture();
    const metrics = new Map<string, string>();
    const reporter = new RtcStatsReporter({
        addRtcEventLog: vi.fn(),
        pushTrendPoint: vi.fn(),
        updateMetricValue: (key, value) => metrics.set(key, value),
    });
    const peer = { getStats: async () => rows } as unknown as RTCPeerConnection; // reason: 時間を進めず統計参照の変化だけを検証する。
    await reporter.collectAndRender(peer);
    expect(metrics.get("rtcRoundTripTime")).toBe("10.0 ms");
    const transport = rows.get("audio-transport");
    if (transport) delete transport.selectedCandidatePairId;
    await reporter.collectAndRender(peer);
    expect(metrics.get("rtcRoundTripTime")).toBe("-");
    expect(metrics.get("rtcLocalCandidate")).toBe("-");
});

it("RTTだけ欠損した場合も候補種別と経路を維持する", async () => {
    const rows = fixture();
    const pair = rows.get("current-pair");
    if (pair) delete pair.currentRoundTripTime;
    const { metrics, summary } = await observe(rows);
    expect(metrics.get("rtcRoundTripTime")).toBe("-");
    expect(metrics.get("rtcCandidatePair")).toBe("relay -> srflx");
    expect(summary?.rtt_ms).toBeUndefined();
    expect(summary?.local_type).toBe("relay");
});
