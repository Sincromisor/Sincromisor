import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OfferResponse } from "../rtcBoundarySchema";

type OwnerCallbacks = {
    audioTrack: MediaStreamTrack;
    onIceConnectionStateChange: (state: RTCIceConnectionState) => void;
    sendIceCandidate: (candidate: RTCIceCandidateInit | null) => void;
};

const mocks = vi.hoisted(() => {
    const bundles: Array<{
        peerConnection: {
            getSenders: ReturnType<typeof vi.fn>;
            signalingState: RTCSignalingState;
        };
        telopChannel: { close: ReturnType<typeof vi.fn> };
        textChannel: { close: ReturnType<typeof vi.fn> };
    }> = [];
    const callbacks: OwnerCallbacks[] = [];
    return {
        bundles,
        callbacks,
        candidateSend: vi.fn(),
        closeBundle: vi.fn(),
        createBundle: vi.fn((params: OwnerCallbacks) => {
            callbacks.push(params);
            const bundle: (typeof bundles)[number] = {
                peerConnection: {
                    getSenders: vi.fn(() => []),
                    signalingState: "stable",
                },
                telopChannel: { close: vi.fn() },
                textChannel: { close: vi.fn() },
            };
            bundles.push(bundle);
            return bundle;
        }),
        healthMessages: [] as (string | undefined)[],
        negotiation: vi.fn(),
        replaceAudioTrack: vi.fn(),
        systemErrors: [] as string[],
    };
});

vi.mock("../rtcPeerConnectionFactory", () => ({
    createRtcPeerConnectionBundle: mocks.createBundle,
}));
vi.mock("../rtcPeerConnectionShutdown", () => ({
    closeRtcPeerConnection: mocks.closeBundle,
}));
vi.mock("../rtcNegotiation", () => ({
    negotiateRtcSession: mocks.negotiation,
}));
vi.mock("../rtcIceCandidateSender", () => ({
    sendRtcIceCandidate: mocks.candidateSend,
}));
vi.mock("../rtcAudioTrackSender", () => ({
    replaceRtcAudioTrack: mocks.replaceAudioTrack,
    setRtcAudioMute: vi.fn(),
}));
vi.mock("../rtcBundleDiagnostics", () => ({
    RtcBundleDiagnostics: class {
        captureFailure(): Promise<void> {
            return Promise.resolve();
        }
        resetFailureCapture(): void {}
        start(): void {}
        stop(): void {}
    },
}));
vi.mock("../../debug/model/debugConsoleManager", () => ({
    DebugConsoleManager: {
        getManager: () => ({
            addRtcEventLog: vi.fn(),
            resetRealtimeStats: vi.fn(),
        }),
    },
}));
vi.mock("../../conversation/chat/model/chatMessageService", () => ({
    ChatMessageService: {
        getService: () => ({
            writeErrorMessage: (message: string) => mocks.systemErrors.push(message),
            writeSystemMessage: vi.fn(),
        }),
    },
}));

import { RtcSignalingHttpError } from "../rtcSignalingHttp";
import { RTCTalkClient } from "../rtcTalkClient";

function answer(sessionId: string, revision?: number): OfferResponse {
    return {
        offer_revision: revision,
        sdp: "v=0",
        session_id: sessionId,
        type: "answer",
    };
}

function createAudioTrack(label = "audio"): MediaStreamTrack {
    return Object.assign(Object.create(EventTarget.prototype), {
        enabled: true,
        kind: "audio",
        label,
        readyState: "live",
        stop: vi.fn(),
    });
}

function deferred<T>(): {
    promise: Promise<T>;
    reject: (reason?: unknown) => void;
    resolve: (value: T) => void;
} {
    let resolvePromise = (_value: T) => {};
    let rejectPromise = (_reason?: unknown) => {};
    const promise = new Promise<T>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });
    return { promise, reject: rejectPromise, resolve: resolvePromise };
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function createClient(track = createAudioTrack()): RTCTalkClient {
    const client = new RTCTalkClient(
        {
            candidateURL: "/candidate",
            iceServers: [],
            offerURL: "/offer",
        },
        track,
        "chat",
    );
    client.rtcHealthCallback = (message) => mocks.healthMessages.push(message);
    return client;
}

beforeEach(() => {
    mocks.bundles.length = 0;
    mocks.callbacks.length = 0;
    mocks.healthMessages.length = 0;
    mocks.systemErrors.length = 0;
    mocks.candidateSend.mockReset().mockResolvedValue(undefined);
    mocks.closeBundle.mockReset();
    mocks.createBundle.mockClear();
    mocks.negotiation.mockReset();
    mocks.replaceAudioTrack.mockReset().mockResolvedValue(undefined);
    vi.spyOn(crypto, "randomUUID")
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000002")
        .mockReturnValue("00000000-0000-4000-8000-000000000003");
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("RTCTalkClient owner state machine", () => {
    it("keeps initial and failed restart Offer generation single-flight", async () => {
        const initial = deferred<OfferResponse>();
        mocks.negotiation.mockReturnValueOnce(initial.promise);
        const client = createClient();

        const firstStart = client.start();
        const secondStart = client.start();
        expect(mocks.negotiation).toHaveBeenCalledTimes(1);
        initial.resolve(answer("session-1", 1));
        await Promise.all([firstStart, secondStart]);

        const restart = deferred<OfferResponse>();
        mocks.negotiation.mockReturnValueOnce(restart.promise);
        mocks.callbacks[0]?.onIceConnectionStateChange("failed");
        mocks.callbacks[0]?.onIceConnectionStateChange("failed");
        expect(mocks.negotiation).toHaveBeenCalledTimes(2);
        restart.resolve(answer("session-1", 2));
        await settle();
        expect(mocks.negotiation.mock.calls[1]?.[0].forceIceRestart).toBe(true);
        expect(mocks.negotiation.mock.calls[1]?.[0].identity).toMatchObject({
            requestId: "00000000-0000-4000-8000-000000000001",
            revision: 2,
            sessionId: "session-1",
        });
    });

    it("cancels disconnected restart on recovery and starts once after 10 second grace", async () => {
        vi.useFakeTimers();
        mocks.negotiation.mockResolvedValue(answer("session-1", 1));
        const client = createClient();
        await client.start();

        mocks.callbacks[0]?.onIceConnectionStateChange("disconnected");
        vi.advanceTimersByTime(9_999);
        mocks.callbacks[0]?.onIceConnectionStateChange("connected");
        vi.advanceTimersByTime(1);
        expect(mocks.negotiation).toHaveBeenCalledTimes(1);

        mocks.negotiation.mockResolvedValueOnce(answer("session-1", 2));
        mocks.callbacks[0]?.onIceConnectionStateChange("disconnected");
        mocks.callbacks[0]?.onIceConnectionStateChange("disconnected");
        await vi.advanceTimersByTimeAsync(10_000);
        expect(mocks.negotiation).toHaveBeenCalledTimes(2);
    });

    it("serializes queued and newly collected candidates through one FIFO flight", async () => {
        const initial = deferred<OfferResponse>();
        const firstCandidate = deferred<void>();
        mocks.negotiation.mockReturnValue(initial.promise);
        mocks.candidateSend
            .mockReturnValueOnce(firstCandidate.promise)
            .mockResolvedValue(undefined);
        const client = createClient();
        const start = client.start();
        mocks.callbacks[0]?.sendIceCandidate({ candidate: "candidate-1" });
        mocks.callbacks[0]?.sendIceCandidate({ candidate: "candidate-2" });

        initial.resolve(answer("session-1", 1));
        await settle();
        expect(mocks.candidateSend).toHaveBeenCalledTimes(1);
        mocks.callbacks[0]?.sendIceCandidate({ candidate: "candidate-3" });
        expect(mocks.candidateSend).toHaveBeenCalledTimes(1);

        firstCandidate.resolve();
        await start;
        await settle();
        expect(mocks.candidateSend.mock.calls.map((call) => call[0].candidate?.candidate)).toEqual([
            "candidate-1",
            "candidate-2",
            "candidate-3",
        ]);
    });

    it.each([
        ["update-offer", 404],
        ["update-offer", 410],
        ["candidate", 404],
        ["candidate", 410],
    ] as const)("replaces the bundle for %s %i with previous session, new UUID, and live track", async (operation, status) => {
        const audioTrack = createAudioTrack();
        mocks.negotiation.mockResolvedValueOnce(answer("session-1", 1));
        const client = createClient(audioTrack);
        await client.start();

        if (operation === "candidate") {
            mocks.negotiation.mockResolvedValueOnce(answer("session-2", 1));
            mocks.candidateSend.mockRejectedValueOnce(
                new RtcSignalingHttpError("session lost", { operation, status }),
            );
            mocks.callbacks[0]?.sendIceCandidate({ candidate: "candidate-lost" });
        } else {
            mocks.negotiation.mockRejectedValueOnce(
                new RtcSignalingHttpError("session lost", { operation, status }),
            );
            mocks.negotiation.mockResolvedValueOnce(answer("session-2", 1));
            mocks.callbacks[0]?.onIceConnectionStateChange("failed");
        }
        await vi.waitFor(() => expect(mocks.createBundle).toHaveBeenCalledTimes(2));
        const replacementCallIndex = operation === "candidate" ? 1 : 2;
        await vi.waitFor(() =>
            expect(mocks.negotiation).toHaveBeenCalledTimes(replacementCallIndex + 1),
        );

        expect(mocks.closeBundle.mock.calls[0]?.[0].stopSenderTracks).toBe(false);
        expect(mocks.createBundle.mock.calls[1]?.[0].audioTrack).toBe(audioTrack);
        expect(mocks.bundles[1]).not.toBe(mocks.bundles[0]);
        expect(mocks.bundles[1]?.textChannel).not.toBe(mocks.bundles[0]?.textChannel);
        expect(mocks.bundles[1]?.telopChannel).not.toBe(mocks.bundles[0]?.telopChannel);
        expect(audioTrack.readyState).toBe("live");
        expect(mocks.negotiation.mock.calls[replacementCallIndex]?.[0]).toMatchObject({
            identity: {
                requestId: "00000000-0000-4000-8000-000000000002",
                revision: 1,
            },
            previousSessionId: "session-1",
        });
        if (operation === "candidate") {
            await vi.waitFor(() => expect(mocks.healthMessages).toHaveLength(2));
            mocks.callbacks[1]?.sendIceCandidate({ candidate: "candidate-new-bundle" });
            await vi.waitFor(() => expect(mocks.candidateSend).toHaveBeenCalledTimes(2));
            expect(mocks.candidateSend.mock.calls[1]?.[0].sessionId).toBe("session-2");
        }
    });

    it("replaces a disconnected legacy bundle with previous session and a new request ID", async () => {
        const audioTrack = createAudioTrack();
        mocks.negotiation.mockResolvedValueOnce(answer("legacy-session"));
        mocks.negotiation.mockResolvedValueOnce(answer("legacy-session-2"));
        const client = createClient(audioTrack);
        await client.start();

        mocks.callbacks[0]?.onIceConnectionStateChange("failed");
        await vi.waitFor(() => expect(mocks.createBundle).toHaveBeenCalledTimes(2));

        expect(mocks.closeBundle.mock.calls[0]?.[0].stopSenderTracks).toBe(false);
        expect(mocks.createBundle.mock.calls[1]?.[0].audioTrack).toBe(audioTrack);
        expect(mocks.bundles[1]).not.toBe(mocks.bundles[0]);
        expect(mocks.bundles[1]?.textChannel).not.toBe(mocks.bundles[0]?.textChannel);
        expect(mocks.negotiation.mock.calls[1]?.[0]).toMatchObject({
            identity: {
                requestId: "00000000-0000-4000-8000-000000000002",
                revision: 1,
            },
            previousSessionId: "legacy-session",
        });
    });

    it.each([
        ["initial-offer", 410],
        ["initial-offer", 400],
        ["update-offer", 409],
        ["update-offer", 413],
    ] as const)("closes and reports terminal %s %i without automatic replacement", async (operation, status) => {
        mocks.negotiation.mockRejectedValue(
            new RtcSignalingHttpError("terminal", { operation, status }),
        );
        const client = createClient();
        await client.start();

        expect(mocks.closeBundle).toHaveBeenCalledTimes(1);
        expect(mocks.closeBundle.mock.calls[0]?.[0].stopSenderTracks).toBeUndefined();
        expect(mocks.systemErrors).toHaveLength(1);
        expect(mocks.healthMessages[mocks.healthMessages.length - 1]).toContain("terminal");
        expect(mocks.createBundle).toHaveBeenCalledTimes(1);
    });

    it("turns candidate retry exhaustion into terminal generation failure", async () => {
        mocks.negotiation.mockResolvedValue(answer("session-1", 1));
        mocks.candidateSend.mockRejectedValue(
            new RtcSignalingHttpError("retry exhausted", { operation: "candidate" }),
        );
        const client = createClient();
        await client.start();

        mocks.callbacks[0]?.sendIceCandidate({ candidate: "candidate-1" });
        await vi.waitFor(() => expect(mocks.closeBundle).toHaveBeenCalledTimes(1));

        expect(mocks.systemErrors[0]).toContain("retry exhausted");
        expect(mocks.createBundle).toHaveBeenCalledTimes(1);
    });

    it("closes the generation when an Answer revision fails identity validation", async () => {
        mocks.negotiation.mockResolvedValue(answer("session-1", 2));
        const client = createClient();

        await client.start();

        expect(mocks.closeBundle).toHaveBeenCalledTimes(1);
        expect(mocks.systemErrors[0]).toContain("revision identity mismatch");
        expect(mocks.createBundle).toHaveBeenCalledTimes(1);
    });

    it("stops old callbacks and preserves track replacement against the current bundle", async () => {
        mocks.negotiation.mockResolvedValue(answer("session-1", 1));
        const client = createClient();
        await client.start();
        const replacementTrack = createAudioTrack("replacement");

        await client.replaceAudioTrack(replacementTrack);
        expect(mocks.replaceAudioTrack.mock.calls[0]?.[0].audioTrack).toBe(replacementTrack);
        client.stop();
        mocks.callbacks[0]?.sendIceCandidate({ candidate: "late-candidate" });
        mocks.callbacks[0]?.onIceConnectionStateChange("failed");
        await settle();

        expect(mocks.closeBundle).toHaveBeenCalledTimes(1);
        expect(mocks.candidateSend).not.toHaveBeenCalled();
        expect(mocks.negotiation).toHaveBeenCalledTimes(1);
    });

    it("passes the latest replacement track into a session-loss bundle", async () => {
        mocks.negotiation.mockResolvedValueOnce(answer("session-1", 1));
        mocks.negotiation.mockResolvedValueOnce(answer("session-2", 1));
        mocks.candidateSend.mockRejectedValueOnce(
            new RtcSignalingHttpError("session lost", {
                operation: "candidate",
                status: 404,
            }),
        );
        const client = createClient();
        await client.start();
        const replacementTrack = createAudioTrack("replacement");
        await client.replaceAudioTrack(replacementTrack);

        mocks.callbacks[0]?.sendIceCandidate({ candidate: "candidate-lost" });
        await vi.waitFor(() => expect(mocks.createBundle).toHaveBeenCalledTimes(2));

        expect(mocks.createBundle.mock.calls[1]?.[0].audioTrack).toBe(replacementTrack);
        expect(replacementTrack.readyState).toBe("live");
    });
});
