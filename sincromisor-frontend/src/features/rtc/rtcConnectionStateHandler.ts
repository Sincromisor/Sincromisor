import { frontendLogger } from "../../shared/logging/appLogger";
import type { ChatMessageService } from "../conversation/chat/model/chatMessageService";

type RtcConnectionStateHandlerParams = {
    captureIceFailureDiagnostics: (reason: string) => void;
    chatMessageService: Pick<ChatMessageService, "writeErrorMessage" | "writeSystemMessage">;
    onDisconnected: () => void;
    onFailed: () => void;
    onRecovered: () => void;
    rtcHealthCallback: (message?: string) => void;
    state: RTCIceConnectionState;
};

/**
 * Browser ICE eventをUI通知とrecovery intentへ変換する。
 *
 * disconnectedの10秒grace、single-flight、legacy/Pion分岐はresource ownerである
 * RTCTalkClientへ委ね、このboundaryはfailedだけを即時recoveryとして通知する。
 */
export function handleRtcIceConnectionState(params: RtcConnectionStateHandlerParams): void {
    switch (params.state) {
        case "new":
            params.chatMessageService.writeSystemMessage("音声認識・合成システムに接続します。");
            break;
        case "checking":
            params.chatMessageService.writeSystemMessage(
                "音声認識・合成システムへの接続を確認しています。",
            );
            break;
        case "connected":
            params.onRecovered();
            params.rtcHealthCallback();
            params.chatMessageService.writeSystemMessage("音声認識・合成システムに接続しました。");
            break;
        case "completed":
            params.onRecovered();
            params.rtcHealthCallback();
            params.chatMessageService.writeSystemMessage(
                "音声認識・合成システムとのセッションの確立に成功しました。",
            );
            break;
        case "disconnected":
            params.rtcHealthCallback("音声認識・合成システムから切断されました。");
            params.chatMessageService.writeErrorMessage(
                "音声認識・合成システムから切断されました。",
            );
            params.onDisconnected();
            break;
        case "failed":
            params.rtcHealthCallback("音声認識・合成システムへの接続に失敗しました。");
            params.chatMessageService.writeErrorMessage(
                "音声認識・合成システムへの接続に失敗しました。",
            );
            params.captureIceFailureDiagnostics("iceConnectionState=failed");
            params.onFailed();
            break;
        default:
            params.rtcHealthCallback(`Unknown ICE Connection State - ${params.state}`);
            params.chatMessageService.writeErrorMessage(
                `Unknown ICE Connection State - ${params.state}`,
            );
            frontendLogger.error("Unknown ICE connection state.", { state: params.state });
    }
}
