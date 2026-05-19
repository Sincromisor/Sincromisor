import { frontendLogger } from "../logging/appLogger";
import type { DebugConsoleManager } from "../ui/debugConsoleManager";
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
};

export type RtcPeerConnectionBundle = RtcDataChannels & {
    peerConnection: RTCPeerConnection;
};

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
        sendIceCandidate: params.sendIceCandidate,
    });
    setupRtcRemoteTrackHandlers({
        logger: params.logger,
        peerConnection,
    });
    const dataChannels = createRtcDataChannels({
        logger: params.logger,
        onTelopMessage: params.onTelopMessage,
        onTextMessage: params.onTextMessage,
        peerConnection,
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
