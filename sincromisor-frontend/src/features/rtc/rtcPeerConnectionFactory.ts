import { frontendLogger } from "../../shared/logging/appLogger";
import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";
import { createRtcDataChannels, type RtcDataChannels } from "./rtcDataChannels";
import type { ChatMessage, TelopChannelMessage } from "./rtcMessage";
import { setupRtcPeerConnectionEvents } from "./rtcPeerConnectionEvents";
import { setupRtcRemoteTrackHandlers } from "./rtcRemoteTrackHandlers";
import type { SincroRTCConfig } from "./sincroRtcConfigManager";

type RtcPeerConnectionFactoryParams = {
    audioTrack: MediaStreamTrack;
    logger: DebugConsoleManager;
    onIceConnectionStateChange: (state: RTCIceConnectionState) => void;
    onTelopMessage: (msg: TelopChannelMessage) => void;
    onTextMessage: (msg: ChatMessage) => void;
    sendIceCandidate: (candidate: RTCIceCandidateInit | null) => void;
    sincroConfig: SincroRTCConfig;
    signal: AbortSignal;
};

/** PeerConnectionと、このconnectionが所有する2つのDataChannelをまとめたresource bundle。 */
export type RtcPeerConnectionBundle = RtcDataChannels & {
    peerConnection: RTCPeerConnection;
};

/**
 * 音声トラックから1接続世代分のPeerConnectionとDataChannelを生成する。
 * 呼び出し元は世代の中断で全イベント購読を解除し、接続の終了と音声トラックの停止可否を管理する。
 */
export function createRtcPeerConnectionBundle(
    params: RtcPeerConnectionFactoryParams,
): RtcPeerConnectionBundle {
    const config = createRtcConfiguration(params.sincroConfig);
    frontendLogger.debug("RTC peer connection config prepared.", {
        iceServerCount: config.iceServers?.length ?? 0,
    });

    const peerConnection = new RTCPeerConnection(config);
    setupRtcPeerConnectionEvents({
        logger: params.logger,
        onIceConnectionStateChange: params.onIceConnectionStateChange,
        peerConnection,
        signal: params.signal,
        sendIceCandidate: params.sendIceCandidate,
    });
    setupRtcRemoteTrackHandlers({
        logger: params.logger,
        peerConnection,
        signal: params.signal,
    });
    const dataChannels = createRtcDataChannels({
        logger: params.logger,
        onTelopMessage: params.onTelopMessage,
        onTextMessage: params.onTextMessage,
        peerConnection,
        signal: params.signal,
    });
    peerConnection.addTrack(params.audioTrack);

    return {
        peerConnection,
        telopChannel: dataChannels.telopChannel,
        textChannel: dataChannels.textChannel,
    };
}

function createRtcConfiguration(sincroConfig: SincroRTCConfig): RTCConfiguration {
    return {
        iceServers: sincroConfig.iceServers,
    };
}
