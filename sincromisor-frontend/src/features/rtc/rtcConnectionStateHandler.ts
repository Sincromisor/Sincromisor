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
    talkMode?: string;
};

/**
 * Browser ICE eventをUI通知とrecovery intentへ変換する。
 *
 * disconnectedの10秒grace、single-flight、legacy/Pion分岐はresource ownerである
 * RTCTalkClientへ委ね、このboundaryはfailedだけを即時recoveryとして通知する。
 */
export function handleRtcIceConnectionState(params: RtcConnectionStateHandlerParams): void {
    const target =
        params.talkMode === "echo"
            ? "入力音声の折り返し診断"
            : params.talkMode === "playback"
              ? "サンプル音声の繰り返し再生"
              : "音声認識・合成システム";
    switch (params.state) {
        case "new":
            params.chatMessageService.writeSystemMessage(`${target}に接続します。`);
            break;
        case "checking":
            params.chatMessageService.writeSystemMessage(`${target}への接続を確認しています。`);
            break;
        case "connected":
            params.onRecovered();
            params.rtcHealthCallback();
            params.chatMessageService.writeSystemMessage(`${target}に接続しました。`);
            break;
        case "completed":
            params.onRecovered();
            params.rtcHealthCallback();
            params.chatMessageService.writeSystemMessage(
                `${target}とのセッションの確立に成功しました。`,
            );
            break;
        case "disconnected":
            params.rtcHealthCallback(`${target}から切断されました。`);
            params.chatMessageService.writeErrorMessage(`${target}から切断されました。`);
            params.onDisconnected();
            break;
        case "failed":
            params.rtcHealthCallback(`${target}への接続に失敗しました。`);
            params.chatMessageService.writeErrorMessage(`${target}への接続に失敗しました。`);
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
