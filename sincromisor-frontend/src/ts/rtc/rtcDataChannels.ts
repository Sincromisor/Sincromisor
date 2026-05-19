import { frontendLogger } from "../logging/appLogger";
import type { DebugConsoleManager } from "../ui/debugConsoleManager";
import {
    type ChatMessage,
    parseChatMessagePayload,
    parseTelopChannelPayload,
    type TelopChannelMessage,
} from "./rtcMessage";

type RtcDataChannelParams = {
    logger: Pick<
        DebugConsoleManager,
        "addRtcEventLog" | "addTelopChannelLog" | "addTextChannelLog"
    >;
    onTelopMessage: (msg: TelopChannelMessage) => void;
    onTextMessage: (msg: ChatMessage) => void;
    peerConnection: RTCPeerConnection;
};

export type RtcDataChannels = {
    telopChannel: RTCDataChannel;
    textChannel: RTCDataChannel;
};

export function createRtcDataChannels(params: RtcDataChannelParams): RtcDataChannels {
    return {
        telopChannel: createTelopChannel(params),
        textChannel: createTextChannel(params),
    };
}

function createTelopChannel(params: RtcDataChannelParams): RTCDataChannel {
    const parameters: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 };
    const dc = params.peerConnection.createDataChannel("telop_ch", parameters);
    dc.onclose = () => {
        params.logger.addTelopChannelLog("- close(telop_ch)\n");
        params.logger.addRtcEventLog("telop_ch closed");
    };
    dc.onopen = () => {
        params.logger.addTelopChannelLog("- open(telop_ch)\n");
        params.logger.addRtcEventLog("telop_ch opened");
    };
    dc.onmessage = (evt) => {
        params.logger.addTelopChannelLog(`< [telop_ch] ${evt.data}\n`);
        try {
            params.onTelopMessage(parseTelopChannelPayload(String(evt.data)));
        } catch (error) {
            params.logger.addRtcEventLog(`invalid telop_ch payload: ${error}`);
            frontendLogger.warn("Invalid telop channel payload.", { error });
        }
    };
    return dc;
}

function createTextChannel(params: RtcDataChannelParams): RTCDataChannel {
    const parameters: RTCDataChannelInit = { ordered: true };
    const dc = params.peerConnection.createDataChannel("text_ch", parameters);
    dc.onclose = () => {
        params.logger.addTextChannelLog("- close(text_ch)\n");
        params.logger.addRtcEventLog("text_ch closed");
    };
    dc.onopen = () => {
        params.logger.addTextChannelLog("- open(text_ch)\n");
        params.logger.addRtcEventLog("text_ch opened");
    };
    dc.onmessage = (evt) => {
        params.logger.addTextChannelLog(`< [text_ch] ${evt.data}\n`);
        try {
            params.onTextMessage(parseChatMessagePayload(String(evt.data)));
        } catch (error) {
            params.logger.addRtcEventLog(`invalid text_ch payload: ${error}`);
            frontendLogger.warn("Invalid text channel payload.", { error });
        }
    };
    return dc;
}
