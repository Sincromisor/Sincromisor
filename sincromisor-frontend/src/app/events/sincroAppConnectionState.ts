import type { SincroAppEvent, SincroAppLifecycleState } from "../controller/sincroAppTypes";
import {
    audioInputFailureMessage,
    type SincroAudioInputState,
} from "../controller/sincroAudioInputState";

/** 停止中・停止済みの操作状態を優先し、残った診断値で接続中へ戻さずUI向け接続状態へ変換する。 */
export function buildSincroAppConnectionStateEvent(params: {
    lifecycleState: SincroAppLifecycleState;
    iceConnectionState: string;
    signalingState: string;
    audioInputState?: SincroAudioInputState;
}): SincroAppEvent {
    if (params.lifecycleState === "stopping") {
        return { type: "connection_state", value: "stopping" };
    }
    if (params.lifecycleState === "stopped") {
        return { type: "connection_state", value: "stopped" };
    }
    // 音声取得が未完了・失敗ならRTC接続中とは表示せず、体験全体の停止とも区別する。
    if (params.audioInputState?.status === "failed") {
        return {
            type: "connection_state",
            value: "input_failed",
            detail: audioInputFailureMessage(params.audioInputState.reason),
        };
    }
    if (params.audioInputState?.status === "acquiring") {
        return { type: "connection_state", value: "starting", detail: "マイクを準備中" };
    }
    const ice = params.iceConnectionState.toLowerCase();
    const signaling = params.signalingState.toLowerCase();

    if (ice === "connected" || ice === "completed") {
        return { type: "connection_state", value: "connected", detail: `ice:${ice}` };
    }
    if (ice === "checking") {
        return { type: "connection_state", value: "connecting", detail: "ice:checking" };
    }
    if (ice === "failed" || ice === "disconnected") {
        return { type: "connection_state", value: "degraded", detail: `ice:${ice}` };
    }
    if (params.lifecycleState === "starting") {
        return { type: "connection_state", value: "starting" };
    }
    if (params.lifecycleState === "running") {
        return {
            type: "connection_state",
            value: "connecting",
            detail: signaling ? `signaling:${signaling}` : "running",
        };
    }
    return { type: "connection_state", value: "idle" };
}
