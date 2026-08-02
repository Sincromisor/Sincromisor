import { afterEach, describe, expect, it, vi } from "vitest";

import { RtcDisconnectedGraceTimer } from "../rtcDisconnectedGraceTimer";

afterEach(() => {
    vi.useRealTimers();
});

describe("RtcDisconnectedGraceTimer", () => {
    it("does not restart when connected returns within 10 seconds", () => {
        vi.useFakeTimers();
        const onGraceExpired = vi.fn();
        const timer = new RtcDisconnectedGraceTimer({ onGraceExpired });

        expect(timer.schedule()).toBe(true);
        vi.advanceTimersByTime(9_999);
        timer.cancel();
        vi.advanceTimersByTime(1);

        expect(onGraceExpired).not.toHaveBeenCalled();
    });

    it("expires once after 10 seconds despite consecutive disconnected events", () => {
        vi.useFakeTimers();
        const onGraceExpired = vi.fn();
        const timer = new RtcDisconnectedGraceTimer({ onGraceExpired });

        expect(timer.schedule()).toBe(true);
        expect(timer.schedule()).toBe(false);
        vi.advanceTimersByTime(10_000);

        expect(onGraceExpired).toHaveBeenCalledTimes(1);
    });
});
