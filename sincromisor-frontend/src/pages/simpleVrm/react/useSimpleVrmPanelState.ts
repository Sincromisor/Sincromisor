import { useRef, useState } from "react";
import type { SincroAppController, SincroAppLifecycleState } from "../../../app/controller";
import { useSincroMediaDeviceState } from "../../../app/react/useSincroMediaDeviceState";
import type { InitialCalibrationStepId } from "../../../character/calibration/initialSincroCalibration";
import {
    InitialSincroCalibrationController,
    type InitialSincroCalibrationControllerState,
} from "../../../character/calibration/initialSincroCalibrationController";
import type { PanelCameraGuideState } from "./panelCameraGuideState";
import type {
    ApplySettingsFn,
    PanelConnectionState,
    PanelGazeState,
    PanelLearnedVadState,
    PanelLookingGlassConfigStatus,
    PanelLookingGlassState,
    PanelMessageLog,
    PanelRtcState,
    PanelTelopLog,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./panelTypes";
import { useSimpleVrmPanelEventState } from "./useSimpleVrmPanelEventState";

type SimpleVrmPanelState = {
    hasActiveController: boolean;
    currentController: SincroAppController | undefined;
    lifecycleState: SincroAppLifecycleState;
    settings: SincroAppSettingsSnapshot;
    settingsUiState: SincroAppSettingsUiState;
    settingsUiHints: SincroAppSettingsUiHints;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
    startupSettingsCapabilities: SincroAppStartupSettingsCapabilities;
    mediaDeviceSnapshot: ReturnType<typeof useSincroMediaDeviceState>["snapshot"];
    audioInputSelection: ReturnType<typeof useSincroMediaDeviceState>["audioInputSelection"];
    videoInputSelection: ReturnType<typeof useSincroMediaDeviceState>["videoInputSelection"];
    logs: PanelMessageLog[];
    vadState: "unknown" | "speech" | "silence";
    learnedVad: PanelLearnedVadState;
    gaze: PanelGazeState;
    rtcEvents: string[];
    rtcState: PanelRtcState;
    connectionState: PanelConnectionState;
    telopLogs: PanelTelopLog[];
    lookingGlass: PanelLookingGlassState;
    lookingGlassConfigStatus: PanelLookingGlassConfigStatus;
    cameraGuide: PanelCameraGuideState;
    calibrationState: InitialSincroCalibrationControllerState;
};

// Control Panel から呼ぶ UI 操作。実処理は AppController に集約し、hook は委譲のみ行う。
type SimpleVrmPanelActions = {
    startAction: () => void;
    stopAction: () => void;
    applySettings: ApplySettingsFn;
    changeTalkMode: (nextTalkMode: string) => void;
    retryCalibration: (stepId: InitialCalibrationStepId) => void;
    refreshDevices: ReturnType<typeof useSincroMediaDeviceState>["refreshDevices"];
};

// AppController のイベント購読を React state に集約する、ページ共通の表示用 hook。
// simple-vrm / vrm360 / looking-glass-vrm で同じ購読ロジックを再利用する。
export function useSimpleVrmPanelState(): SimpleVrmPanelState & SimpleVrmPanelActions {
    const eventState = useSimpleVrmPanelEventState();
    const calibrationController = useRef(new InitialSincroCalibrationController());
    const [calibrationState, setCalibrationState] =
        useState<InitialSincroCalibrationControllerState>(calibrationController.current.getState());
    const {
        snapshot: mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
    } = useSincroMediaDeviceState({
        audioInputDeviceId: eventState.settings.audioInputDeviceId,
        videoInputDeviceId: eventState.settings.videoInputDeviceId,
    });

    const startAction = (): void => {
        if (eventState.settings.talkMode === "sincro") {
            const current = calibrationController.current.getState();
            if (current.status !== "active") {
                const sessionId = `sincro-calibration:${Date.now()}`;
                calibrationController.current.dispatch({
                    type: "start",
                    sessionId,
                    mediaTimeMs: performance.now(),
                });
                setCalibrationState(calibrationController.current.getState());
            }
        }
        // 開始の順序制御（hooks/lifecycle）は AppController に任せる。
        eventState.currentController?.start();
    };

    const stopAction = (): void => {
        cancelCalibration("camera_stopped");
        // stop も AppController 経由で行い、RTC停止の順序/状態遷移をUI側で持たない。
        eventState.currentController?.stop();
    };

    const applySettings: ApplySettingsFn = (partial) => {
        if (
            (partial.talkMode !== undefined && partial.talkMode !== "sincro") ||
            (partial.videoInputDeviceId !== undefined &&
                partial.videoInputDeviceId !== eventState.settings.videoInputDeviceId)
        ) {
            cancelCalibration(
                partial.talkMode !== undefined ? "talk_mode_leave" : "camera_changed",
            );
        }
        // 設定適用ロジックは AppController 側に集約し、hook は委譲のみ行う。
        eventState.currentController?.applySettings(partial);
    };

    const changeTalkMode = (nextTalkMode: string): void => {
        applySettings({ talkMode: nextTalkMode });
    };

    const cancelCalibration = (reason: string): void => {
        const current = calibrationController.current.getState();
        if (current.status !== "active") {
            return;
        }
        calibrationController.current.dispatch({
            type: "cancel",
            sessionId: current.sessionId,
            reason,
        });
        setCalibrationState(calibrationController.current.getState());
    };

    const retryCalibration = (stepId: InitialCalibrationStepId): void => {
        const current = calibrationController.current.getState();
        if (current.status !== "active") {
            return;
        }
        calibrationController.current.dispatch({
            type: "retry",
            sessionId: current.sessionId,
            stepId,
        });
        setCalibrationState(calibrationController.current.getState());
    };

    return {
        ...eventState,
        mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        startAction,
        stopAction,
        applySettings,
        changeTalkMode,
        refreshDevices,
        calibrationState,
        retryCalibration,
    };
}
