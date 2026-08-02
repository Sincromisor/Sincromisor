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

    it("treats a 200 JSON parse failure as terminal after one HTTP execution", async () => {
        const responseWithInvalidJson = new Response("not-json", { status: 200 });
        const json = vi
            .spyOn(responseWithInvalidJson, "json")
            .mockRejectedValue(new SyntaxError("invalid JSON"));
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseWithInvalidJson);

        await expect(
            postRtcSignalingJson({
                body: "{}",
                fetch: fetchMock,
                operation: "initial-offer",
                url: "/offer",
            }),
        ).rejects.toThrow("invalid JSON");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(json).toHaveBeenCalledTimes(1);
    });

    it("retries immediate network failures at the expected fake-clock call times", async () => {
        vi.useFakeTimers({ now: 0 });
        const callTimes: number[] = [];
        const fetchMock = vi.fn<typeof fetch>(async () => {
            callTimes.push(Date.now());
            throw new TypeError("network unavailable");
        });
        const request = postRtcSignalingJson({
            body: "{}",
            fetch: fetchMock,
            operation: "candidate",
            retryClock: fakeClock(),
            url: "/candidate",
        });
        const rejection = expect(request).rejects.toThrow("retry exhausted");

        await vi.runAllTimersAsync();
        await rejection;

        expect(callTimes).toEqual([0, 250, 750, 1_750]);
    });

    it.each([
        ["initial-offer", [0, 10_250, 20_750], [10_000, 10_000, 9_250]],
        ["candidate", [0, 5_250, 10_750, 16_750], [5_000, 5_000, 5_000, 5_000]],
    ] as const)("applies per-attempt timeout and total-deadline clipping for %s", async (operation, expectedCalls, expectedTimeouts) => {
        vi.useFakeTimers({ now: 0 });
        const callTimes: number[] = [];
        const timeoutDurations: number[] = [];
        const fetchMock = vi.fn<typeof fetch>((_url, init) => {
            const startedAt = Date.now();
            callTimes.push(startedAt);
            return new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => {
                    timeoutDurations.push(Date.now() - startedAt);
                    reject(new Error("attempt timeout"));
                });
            });
        });
        const request = postRtcSignalingJson({
            body: "{}",
            fetch: fetchMock,
            operation,
            retryClock: fakeClock(),
            url: "/signaling",
        });
        const rejection = expect(request).rejects.toBeInstanceOf(Error);

        await vi.runAllTimersAsync();
        await rejection;

        expect(callTimes).toEqual(expectedCalls);
        expect(timeoutDurations).toEqual(expectedTimeouts);
    });
});
