import { frontendLogger } from "../../shared/logging/appLogger";
import type { ChatMessageService } from "../conversation/chat/model/chatMessageService";

type RtcConnectionStateHandlerParams = {
    captureIceFailureDiagnostics: (reason: string) => void;
    chatMessageService: Pick<ChatMessageService, "writeErrorMessage" | "writeSystemMessage">;
    onIceFailureDiagnosticsReset: () => void;
    reconnect: () => void;
    rtcHealthCallback: (message?: string) => void;
    state: RTCIceConnectionState;
};

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
            params.onIceFailureDiagnosticsReset();
            params.rtcHealthCallback();
            params.chatMessageService.writeSystemMessage("音声認識・合成システムに接続しました。");
            break;
        case "completed":
            params.onIceFailureDiagnosticsReset();
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
            break;
        case "failed":
            params.rtcHealthCallback("音声認識・合成システムへの接続に失敗しました。");
            params.chatMessageService.writeErrorMessage(
                "音声認識・合成システムへの接続に失敗しました。",
            );
            params.captureIceFailureDiagnostics("iceConnectionState=failed");
            params.reconnect();
            break;
        default:
            params.rtcHealthCallback(`Unknown ICE Connection State - ${params.state}`);
            params.chatMessageService.writeErrorMessage(
                `Unknown ICE Connection State - ${params.state}`,
            );
            frontendLogger.error("Unknown ICE connection state.", { state: params.state });
    }
}
