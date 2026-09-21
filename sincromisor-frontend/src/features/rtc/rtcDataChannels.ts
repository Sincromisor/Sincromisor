import { frontendLogger } from "../../shared/logging/appLogger";
import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";
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
    signal: AbortSignal;
};

/** 接続世代と生存期間を共有するテキスト・テロップ通信路。 */
export type RtcDataChannels = {
    telopChannel: RTCDataChannel;
    textChannel: RTCDataChannel;
};

/** 両通信路を作成し、世代終了時は受信・開閉の全購読を解除する。 */
export function createRtcDataChannels(params: RtcDataChannelParams): RtcDataChannels {
    return {
        telopChannel: createTelopChannel(params),
        textChannel: createTextChannel(params),
    };
}

/** 遅延を避けるテロップ用の非再送チャネル。本文は既存画面へ、状態だけ中央へ渡す。 */
function createTelopChannel(params: RtcDataChannelParams): RTCDataChannel {
    const parameters: RTCDataChannelInit = { ordered: false, maxRetransmits: 0 };
    const dc = params.peerConnection.createDataChannel("telop_ch", parameters);
    dc.addEventListener(
        "close",
        () => {
            params.logger.addTelopChannelLog("- close(telop_ch)\n");
            params.logger.addRtcEventLog("telop_ch closed");
            frontendLogger.diagnostic("rtc_telop", "closed");
        },
        { signal: params.signal },
    );
    dc.addEventListener(
        "open",
        () => {
            params.logger.addTelopChannelLog("- open(telop_ch)\n");
            params.logger.addRtcEventLog("telop_ch opened");
            frontendLogger.diagnostic("rtc_telop", "ready");
        },
        { signal: params.signal },
    );
    dc.addEventListener(
        "message",
        (evt) => {
            params.logger.addTelopChannelLog(`< [telop_ch] ${evt.data}\n`);
            try {
                params.onTelopMessage(parseTelopChannelPayload(String(evt.data)));
            } catch (error) {
                params.logger.addRtcEventLog(`invalid telop_ch payload: ${error}`);
                frontendLogger.warn("Invalid telop channel payload.", { error });
            }
        },
        { signal: params.signal },
    );
    return dc;
}

/** 発話順を保つ本文チャネル。入力検証の失敗は固定分類で中央へ通知する。 */
function createTextChannel(params: RtcDataChannelParams): RTCDataChannel {
    const parameters: RTCDataChannelInit = { ordered: true };
    const dc = params.peerConnection.createDataChannel("text_ch", parameters);
    dc.addEventListener(
        "close",
        () => {
            params.logger.addTextChannelLog("- close(text_ch)\n");
            params.logger.addRtcEventLog("text_ch closed");
            frontendLogger.diagnostic("rtc_text", "closed");
        },
        { signal: params.signal },
    );
    dc.addEventListener(
        "open",
        () => {
            params.logger.addTextChannelLog("- open(text_ch)\n");
            params.logger.addRtcEventLog("text_ch opened");
            frontendLogger.diagnostic("rtc_text", "ready");
        },
        { signal: params.signal },
    );
    dc.addEventListener(
        "message",
        (evt) => {
            params.logger.addTextChannelLog(`< [text_ch] ${evt.data}\n`);
            try {
                params.onTextMessage(parseChatMessagePayload(String(evt.data)));
            } catch (error) {
                params.logger.addRtcEventLog(`invalid text_ch payload: ${error}`);
                frontendLogger.warn("Invalid text channel payload.", { error });
            }
        },
        { signal: params.signal },
    );
    return dc;
}
