import { afterEach, describe, expect, it, vi } from "vitest";

import { postRtcSignalingJson, type RtcRetryClock } from "../rtcSignalingHttp";

function fakeClock(random = 0.5): RtcRetryClock {
    return {
        clearTimeout: (timerId) => clearTimeout(timerId),
        now: () => Date.now(),
        random: () => random,
        setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    };
}

function response(status: number, headers?: HeadersInit): Response {
    return new Response(JSON.stringify({ status: true }), {
        headers,
        status,
        statusText: `status-${status}`,
    });
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("postRtcSignalingJson", () => {
    it("reuses one serialized body for 4 executions with 500/1000/2000 full-jitter caps", async () => {
        vi.useFakeTimers({ now: 0 });
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(response(500))
            .mockResolvedValueOnce(response(429))
            .mockResolvedValueOnce(response(503))
            .mockResolvedValueOnce(response(200));
        const request = postRtcSignalingJson({
            body: '{"immutable":true}',
            fetch: fetchMock,
            operation: "initial-offer",
            retryClock: fakeClock(),
            url: "/offer",
        });

        await vi.runAllTimersAsync();
        await expect(request).resolves.toEqual({ status: true });

        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(fetchMock.mock.calls.map((call) => call[1]?.body)).toEqual([
            '{"immutable":true}',
            '{"immutable":true}',
            '{"immutable":true}',
            '{"immutable":true}',
        ]);
        expect(Date.now()).toBe(1_750);
    });

    it("uses Retry-After instead of jitter", async () => {
        vi.useFakeTimers({ now: 0 });
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(response(429, { "Retry-After": "3" }))
            .mockResolvedValueOnce(response(200));
        const request = postRtcSignalingJson({
            body: "{}",
            fetch: fetchMock,
            operation: "candidate",
            retryClock: fakeClock(0),
            url: "/candidate",
        });

        await vi.runAllTimersAsync();
        await request;

        expect(Date.now()).toBe(3_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
        ["initial-offer", 410],
        ["update-offer", 404],
        ["update-offer", 409],
        ["candidate", 410],
        ["candidate", 413],
    ] as const)("preserves operation %s and terminal status %i", async (operation, status) => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(status));

        const request = postRtcSignalingJson({
            body: "{}",
            fetch: fetchMock,
            operation,
            url: "/signaling",
        });

        await expect(request).rejects.toMatchObject({
            operation,
            status,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not start another execution when Retry-After reaches the total deadline", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(response(429, { "Retry-After": "30" }));

        await expect(
            postRtcSignalingJson({
                body: "{}",
                fetch: fetchMock,
                operation: "initial-offer",
                retryClock: fakeClock(),
                url: "/offer",
            }),
        ).rejects.toThrow("retry delay exceeds deadline");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("aborts an in-flight generation without starting a retry", async () => {
        const generation = new AbortController();
        const fetchMock = vi.fn<typeof fetch>((_url, init) => {
            return new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            });
        });
        const request = postRtcSignalingJson({
            body: "{}",
            fetch: fetchMock,
            operation: "initial-offer",
            signal: generation.signal,
            url: "/offer",
        });

        generation.abort();

        await expect(request).rejects.toThrow("generation was closed");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
