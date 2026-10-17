import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserDiagnostics, diagnosticReason } from "../browserDiagnostics";

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

/** 本体とは切り離した送信が、停止時も有限で、復旧後は安全な項目だけを送る。 */
it("送信停止・再開、上限、本文非送信、会話前後の識別を確認する", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", new EventTarget());
    const fetcher = vi.fn().mockRejectedValue(new Error("private-token"));
    vi.stubGlobal("fetch", fetcher);
    const diagnostics = new BrowserDiagnostics();
    diagnostics.start();
    diagnostics.record("microphone", "permission_denied");
    diagnostics.record("microphone", "permission_denied");
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(diagnostics.getStats()).toEqual({ pending: 0, failures: 3, dropped: 2 });
    fetcher.mockResolvedValue({ status: 204 });
    diagnostics.record("render", "ready");
    diagnostics.setSession("01K1AF2Y0H0000000000000001");
    diagnostics.record("rtc", "connected");
    diagnostics.record("model", "private-token");
    await vi.advanceTimersByTimeAsync(1000);
    const sent = JSON.parse(fetcher.mock.calls[fetcher.mock.calls.length - 1]?.[1].body);
    expect(sent.events[0].session_id).toBeUndefined();
    expect(sent.events[1].session_id).toBe("01K1AF2Y0H0000000000000001");
    expect(sent.events[2].reason).toBe("unknown");
    expect(sent.dropped).toBe(2);
    expect(sent.failures).toBe(3);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("private-token");
    for (let i = 0; i < 100; i++) diagnostics.record(i % 2 ? "model" : "rtc", "failed");
    expect(diagnostics.getStats().pending).toBe(64);
    expect(diagnostics.getStats().dropped).toBeGreaterThan(2);
});

it("Workerの同状態と例外本文を送らず、状態変化と回復だけを記録する", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", new EventTarget());
    const fetcher = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal("fetch", fetcher);
    const diagnostics = new BrowserDiagnostics();
    diagnostics.start();
    diagnostics.state("vad_worker", "fallback");
    diagnostics.state("vad_worker", "fallback");
    diagnostics.state("vad_worker", "ready");
    window.dispatchEvent(new Event("unhandledrejection"));
    expect(diagnosticReason(new DOMException("private-token", "NotAllowedError"))).toBe(
        "permission_denied",
    );
    await vi.advanceTimersByTimeAsync(1000);
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sent.events.map((entry: { reason: string }) => entry.reason)).toEqual([
        "fallback",
        "ready",
        "failed",
    ]);
});

it("操作とHTTP状態を分けて集約し、実送信JSONをGo契約fixtureと照合する", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-17T00:00:00Z") });
    vi.stubGlobal("window", new EventTarget());
    vi.spyOn(crypto, "randomUUID").mockReturnValue("ab36ef90-fcf8-44b9-9b15-a1e198ca50fd");
    const fetcher = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal("fetch", fetcher);
    const diagnostics = new BrowserDiagnostics();
    diagnostics.start();
    diagnostics.setSession("01K1AF2Y0H0000000000000001");
    diagnostics.record("signaling", "failed", { operation: "update-offer", http_status: 404 });
    diagnostics.record("signaling", "failed", { operation: "update-offer", http_status: 404 });
    diagnostics.record("signaling", "failed", { operation: "candidate", http_status: 404 });
    diagnostics.record("signaling", "failed", { operation: "candidate", http_status: 410 });
    diagnostics.record("signaling", "failed", { operation: "initial-offer", http_status: 429 });
    diagnostics.record("signaling", "failed", { operation: "initial-offer", http_status: 503 });
    diagnostics.record("signaling", "failed", { operation: "initial-offer" });
    diagnostics.record("rtc", "failed", { operation: "candidate" });
    diagnostics.record("signaling", "failed", { http_status: 599.5 });
    await vi.advanceTimersByTimeAsync(1000);
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    const fixture = JSON.parse(
        readFileSync(
            new URL(
                "../../../../../sincromisor-server/sincro-rtc/internal/signaling/testdata/browser-signaling-diagnostics.json",
                import.meta.url,
            ),
            "utf8",
        ),
    );
    expect(sent).toEqual(fixture);
});
