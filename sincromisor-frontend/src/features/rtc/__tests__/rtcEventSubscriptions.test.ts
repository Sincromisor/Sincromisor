import { afterEach, expect, it, vi } from "vitest";
import { createRtcDataChannels } from "../rtcDataChannels";
import { ChatMessageBuilder } from "../rtcMessage";
import { setupRtcPeerConnectionEvents } from "../rtcPeerConnectionEvents";
import { setupRtcRemoteTrackHandlers } from "../rtcRemoteTrackHandlers";

afterEach(() => vi.unstubAllGlobals());

it("世代中断でICE・シグナリング・トラック・DataChannelの購読をすべて解除する", () => {
    const controller = new AbortController();
    const channels = new Map<string, EventTarget>();
    const target = Object.assign(new EventTarget(), {
        iceConnectionState: "connected",
        iceGatheringState: "complete",
        signalingState: "stable",
        createDataChannel: (label: string) => {
            const channel = new EventTarget();
            channels.set(label, channel);
            return channel;
        },
    });
    const peerConnection = target as unknown as RTCPeerConnection; // reason: ブラウザー通信だけを代替し、購読と解除は標準EventTargetで検証する。
    const logger = {
        addRtcEventLog: vi.fn(),
        addTelopChannelLog: vi.fn(),
        addTextChannelLog: vi.fn(),
        newIceConnectionState: vi.fn(),
        newIceGatheringState: vi.fn(),
        newSignalingState: vi.fn(),
        updateIceConnectionState: vi.fn(),
        updateIceGatheringState: vi.fn(),
        updateSignalingState: vi.fn(),
        setRemoteAudioTrack: vi.fn(),
    };
    const onIceConnectionStateChange = vi.fn();
    const sendIceCandidate = vi.fn();
    const onTextMessage = vi.fn();
    const onTelopMessage = vi.fn();
    const params = { logger, peerConnection, signal: controller.signal };
    setupRtcPeerConnectionEvents({ ...params, onIceConnectionStateChange, sendIceCandidate });
    setupRtcRemoteTrackHandlers(params);
    createRtcDataChannels({ ...params, onTextMessage, onTelopMessage });
    const mediaElement = { srcObject: undefined };
    const querySelector = vi.fn(() => mediaElement);
    vi.stubGlobal("document", { querySelector });
    const track = { kind: "audio" };
    const stream = {};
    const message = new ChatMessageBuilder({
        message: "テスト",
        messageType: "system",
        speakerId: "test",
        speakerName: "テスト",
        speechId: 1,
    });
    const dispatch = () => {
        for (const type of [
            "iceconnectionstatechange",
            "icegatheringstatechange",
            "signalingstatechange",
            "icecandidateerror",
        ]) {
            target.dispatchEvent(new Event(type));
        }
        target.dispatchEvent(Object.assign(new Event("icecandidate"), { candidate: null }));
        target.dispatchEvent(Object.assign(new Event("track"), { track, streams: [stream] }));
        for (const channel of channels.values()) {
            channel.dispatchEvent(new Event("open"));
            channel.dispatchEvent(new Event("close"));
        }
        channels
            .get("text_ch")
            ?.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
        channels.get("telop_ch")?.dispatchEvent(
            new MessageEvent("message", {
                data: JSON.stringify({
                    speech_id: 1,
                    timestamp: 0,
                    message: "テスト",
                    vowel: "o",
                    text: "と",
                    length: 0.1,
                    new_text: true,
                }),
            }),
        );
    };
    dispatch();
    expect(onIceConnectionStateChange).toHaveBeenCalledExactlyOnceWith("connected");
    expect(sendIceCandidate).toHaveBeenCalledExactlyOnceWith(null);
    expect(onTextMessage).toHaveBeenCalledOnce();
    expect(onTelopMessage).toHaveBeenCalledOnce();
    expect(mediaElement.srcObject).toBe(stream);
    expect(logger.updateIceGatheringState).toHaveBeenCalledExactlyOnceWith("complete");
    expect(logger.updateSignalingState).toHaveBeenCalledExactlyOnceWith("stable");

    controller.abort();
    vi.clearAllMocks();
    dispatch();
    for (const callback of [
        ...Object.values(logger),
        onIceConnectionStateChange,
        sendIceCandidate,
        onTextMessage,
        onTelopMessage,
        querySelector,
    ]) {
        expect(callback).not.toHaveBeenCalled();
    }
});
