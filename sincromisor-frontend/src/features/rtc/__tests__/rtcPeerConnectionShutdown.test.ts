import { afterEach, describe, expect, it, vi } from "vitest";

import { closeRtcPeerConnection } from "../rtcPeerConnectionShutdown";

function createShutdownFixture() {
    const track = { stop: vi.fn() };
    const transceiver = { stop: vi.fn() };
    const peerConnection = Object.assign(Object.create(EventTarget.prototype), {
        close: vi.fn(),
        getSenders: vi.fn(() => [{ track }]),
        getTransceivers: vi.fn(() => [transceiver]),
    });
    const telopChannel: RTCDataChannel = Object.assign(Object.create(EventTarget.prototype), {
        close: vi.fn(),
    });
    const textChannel: RTCDataChannel = Object.assign(Object.create(EventTarget.prototype), {
        close: vi.fn(),
    });
    return {
        peerConnection,
        telopChannel,
        textChannel,
        track,
        transceiver,
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("closeRtcPeerConnection", () => {
    it("keeps the sender track live for bundle replacement", async () => {
        vi.useFakeTimers();
        const fixture = createShutdownFixture();

        closeRtcPeerConnection({
            ...fixture,
            stopSenderTracks: false,
        });
        await vi.advanceTimersByTimeAsync(1_000);

        expect(fixture.track.stop).not.toHaveBeenCalled();
        expect(fixture.transceiver.stop).toHaveBeenCalledOnce();
        expect(fixture.textChannel.close).toHaveBeenCalledOnce();
        expect(fixture.telopChannel.close).toHaveBeenCalledOnce();
        expect(fixture.peerConnection.close).toHaveBeenCalledOnce();
    });

    it("stops sender tracks when the logical client terminates", () => {
        vi.useFakeTimers();
        const fixture = createShutdownFixture();

        closeRtcPeerConnection(fixture);

        expect(fixture.track.stop).toHaveBeenCalledOnce();
    });
});
