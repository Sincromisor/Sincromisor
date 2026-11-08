import { afterEach, expect, it, vi } from "vitest";

import { postRtcSignalingJson } from "../rtcSignalingHttp";

afterEach(() => {
    vi.useRealTimers();
});

// ヘッダーだけ受信した実際のResponseストリームを使い、本文待機にも中断が届くことを確認する。
function stalledResponse(signal: AbortSignal): Response {
    return new Response(
        new ReadableStream({
            start(controller) {
                signal.addEventListener(
                    "abort",
                    () => controller.error(new DOMException("aborted", "AbortError")),
                    { once: true },
                );
            },
        }),
    );
}

it("本文受信が停止してもHTTP実行期限と全体期限で終了する", async () => {
    vi.useFakeTimers({ now: 0 });
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) =>
        stalledResponse(init?.signal as AbortSignal),
    );
    const request = postRtcSignalingJson({
        body: "{}",
        fetch: fetchMock,
        operation: "initial-offer",
        url: "/offer",
    });
    const failure = request.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await Promise.race([failure, Promise.resolve("pending")])).toBeInstanceOf(Error);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(vi.getTimerCount()).toBe(0);
});

it("本文受信中の停止が待機を解除し再試行しない", async () => {
    vi.useFakeTimers();
    const generation = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) =>
        stalledResponse(init?.signal as AbortSignal),
    );
    const request = postRtcSignalingJson({
        body: "{}",
        fetch: fetchMock,
        operation: "candidate",
        signal: generation.signal,
        url: "/candidate",
    });
    const failure = request.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    generation.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(await Promise.race([failure, Promise.resolve("pending")])).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
});

it("Retry-After待機中の停止がタイマーを解除する", async () => {
    vi.useFakeTimers();
    const generation = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(
        async () => new Response("", { status: 429, headers: { "Retry-After": "20" } }),
    );
    const request = postRtcSignalingJson({
        body: "{}",
        fetch: fetchMock,
        operation: "candidate",
        signal: generation.signal,
        url: "/candidate",
    });
    const failure = request.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    generation.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(await Promise.race([failure, Promise.resolve("pending")])).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
});

it("エラー本文の解放失敗でもセッション消失のHTTP状態を維持する", async () => {
    const stream = new ReadableStream({
        start(controller) {
            controller.error(new Error("broken body"));
        },
    });
    const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(stream, { status: 410 }));
    await expect(
        postRtcSignalingJson({
            body: "{}",
            fetch: fetchMock,
            operation: "candidate",
            url: "/candidate",
        }),
    ).rejects.toMatchObject({ status: 410, operation: "candidate" });
    expect(fetchMock).toHaveBeenCalledOnce();
});
