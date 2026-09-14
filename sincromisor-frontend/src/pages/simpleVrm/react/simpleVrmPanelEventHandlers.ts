import type { Dispatch, SetStateAction } from "react";
import type { SincroAppEvent } from "../../../app/controller";
import {
    createPanelCameraGuideState,
    type PanelCameraGuideState,
    reducePanelCameraGuideState,
} from "./panelCameraGuideState";
import type {
    PanelGazeState,
    PanelLearnedVadState,
    PanelLookingGlassConfigStatus,
    PanelLookingGlassState,
    PanelRtcState,
} from "./panelTypes";

/** 表示に必要なイベントだけを受け取る、イベント種別に対応した処理。 */
export type SimpleVrmPanelEventHandlerMap = {
    [K in SincroAppEvent["type"]]?: (event: Extract<SincroAppEvent, { type: K }>) => void;
};

/** パネルの現在状態を更新する。履歴は会話・診断の各表示側が所有する。 */
export type SimpleVrmPanelRuntimeEventSetters = {
    setVadState: Dispatch<SetStateAction<"unknown" | "speech" | "silence">>;
    setLearnedVad: Dispatch<SetStateAction<PanelLearnedVadState>>;
    setGaze: Dispatch<SetStateAction<PanelGazeState>>;
    setRtcState: Dispatch<SetStateAction<PanelRtcState>>;
    setLookingGlass: Dispatch<SetStateAction<PanelLookingGlassState>>;
    setLookingGlassConfigStatus: Dispatch<SetStateAction<PanelLookingGlassConfigStatus>>;
    setCameraGuide: Dispatch<SetStateAction<PanelCameraGuideState>>;
    setVrmStatusText: Dispatch<SetStateAction<string>>;
};

/** アプリ通知を接続・追跡・Looking Glassの現在表示へ振り分ける。 */
export function createSimpleVrmPanelRuntimeEventHandlers(
    runtimeSetters: SimpleVrmPanelRuntimeEventSetters,
): SimpleVrmPanelEventHandlerMap {
    return {
        ...createRuntimeStatusEventHandlers(runtimeSetters),
        ...createLookingGlassEventHandlers(runtimeSetters),
    };
}

function createRuntimeStatusEventHandlers(
    setters: SimpleVrmPanelRuntimeEventSetters,
): SimpleVrmPanelEventHandlerMap {
    return {
        local_vad_state: (event) => setters.setVadState(event.isSpeech ? "speech" : "silence"),
        gaze_status: (event) =>
            setters.setGaze((prev) => ({
                faceX: event.faceX ?? prev.faceX,
                faceY: event.faceY ?? prev.faceY,
                facing: event.facing ?? prev.facing,
                watching: typeof event.watching === "boolean" ? event.watching : prev.watching,
            })),
        rtc_state: (event) =>
            setters.setRtcState((prev) => ({
                iceConnectionState: event.iceConnectionState ?? prev.iceConnectionState,
                signalingState: event.signalingState ?? prev.signalingState,
            })),
        learned_vad_state: (event) =>
            setters.setLearnedVad({ status: event.status, probability: event.probability }),
        "camera-quality-changed": (event) =>
            setters.setCameraGuide((state) =>
                reducePanelCameraGuideState(state, event.quality, event.observedAtMs),
            ),
        "camera-quality-reset": () => setters.setCameraGuide(createPanelCameraGuideState()),
        dialog_vrm_ui_state: (event) => setters.setVrmStatusText(event.uiState.vrmStatusText),
    };
}

function createLookingGlassEventHandlers(
    setters: SimpleVrmPanelRuntimeEventSetters,
): SimpleVrmPanelEventHandlerMap {
    return {
        looking_glass_state: (event) =>
            setters.setLookingGlass({
                state: event.state,
                code: event.code ?? "",
                message: event.message ?? "",
            }),
        looking_glass_config_status: (event) => setters.setLookingGlassConfigStatus(event.status),
    };
}
