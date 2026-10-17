import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { frontendLogger } from "../../../../shared/logging/appLogger";
import { BrowserDiagnostics } from "../../../../shared/logging/browserDiagnostics";
import { captureIceFailureDiagnostics } from "../rtcIceDiagnostics";
import type { RtcStatsRecord } from "../rtcStatsRecords";

const session = "01K1AF2Y0H0000000000000001";

function report(selected: boolean): RTCStatsReport {
    const rows: RtcStatsRecord[] = [
        {
            id: "private-local",
            timestamp: 1,
            type: "local-candidate",
            candidateType: "host",
            address: "private-ip",
            port: 1234,
        },
        {
            id: "private-remote",
            timestamp: 1,
            type: "remote-candidate",
            candidateType: "relay",
            ip: "private-ip",
        },
        {
            id: "private-pair",
            timestamp: 1,
            type: "candidate-pair",
            state: "succeeded",
            selected,
            localCandidateId: "private-local",
            remoteCandidateId: "private-remote",
            currentRoundTripTime: 0.025,
        },
        { id: "private-other", timestamp: 1, type: "candidate-pair", state: "failed" },
    ];
    return new Map(rows.map((row) => [row.id, row]));
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

it.each([session, undefined])(
    "遅延した失敗統計を開始時の会話 %s に対応付ける",
    async (capturedSession) => {
        vi.useFakeTimers({ now: new Date("2026-10-17T00:00:00Z") });
        vi.stubGlobal("window", new EventTarget());
        vi.stubGlobal("navigator", { userAgent: "private-user-agent" });
        vi.spyOn(crypto, "randomUUID").mockReturnValue("ab36ef90-fcf8-44b9-9b15-a1e198ca50fd");
        const fetcher = vi.fn().mockResolvedValue({ status: 204 });
        vi.stubGlobal("fetch", fetcher);
        const diagnostics = new BrowserDiagnostics();
        diagnostics.start();
        diagnostics.setSession(capturedSession);
        vi.spyOn(frontendLogger.diagnostics, "record").mockImplementation((...args) =>
            diagnostics.record(...args),
        );
        let complete: ((value: RTCStatsReport) => void) | undefined;
        const pending = new Promise<RTCStatsReport>((resolve) => {
            complete = resolve;
        });
        const capture = captureIceFailureDiagnostics({
            peerConnection: {
                getStats: () => pending,
                signalingState: "stable",
                iceGatheringState: "complete",
            },
            sessionId: capturedSession,
            reason: "failed",
            logger: { addRtcEventLog: vi.fn() },
        });
        diagnostics.setSession("01K1AF2Y0H0000000000000002");
        if (!complete) throw new Error("missing statistics callback");
        complete(report(true));
        await capture;
        await vi.advanceTimersByTimeAsync(1000);
        const sent = JSON.parse(fetcher.mock.calls[0][1].body);
        expect(sent.events[0].session_id).toBe(capturedSession);
        expect(JSON.stringify(sent)).not.toContain("private-");
        if (capturedSession) {
            const fixture = JSON.parse(
                readFileSync(
                    new URL(
                        "../../../../../../sincromisor-server/sincro-rtc/internal/signaling/testdata/browser-ice-diagnostics.json",
                        import.meta.url,
                    ),
                    "utf8",
                ),
            );
            expect(sent).toEqual(fixture);
        }
    },
);

it("選択ペアがなければ候補種別・ペア状態・RTTを作らない", async () => {
    vi.stubGlobal("navigator", { userAgent: "private-user-agent" });
    const record = vi.spyOn(frontendLogger.diagnostics, "record").mockImplementation(() => {});
    await captureIceFailureDiagnostics({
        peerConnection: {
            getStats: async () => report(false),
            signalingState: "stable",
            iceGatheringState: "complete",
        },
        reason: "failed",
        logger: { addRtcEventLog: vi.fn() },
    });
    const summary = record.mock.calls[0][2]?.ice_summary;
    expect(summary?.pair_count).toBe(2);
    expect(summary?.succeeded_pair_count).toBe(1);
    expect(summary?.pair_state).toBeUndefined();
    expect(summary?.local_type).toBeUndefined();
    expect(summary?.remote_type).toBeUndefined();
    expect(summary?.rtt_ms).toBeUndefined();
});
