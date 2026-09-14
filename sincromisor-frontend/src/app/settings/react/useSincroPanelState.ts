import { useEffect, useState } from "react";
import type { InitialCalibrationStepId } from "../../../character/calibration/initialSincroCalibration";
import type { InitialSincroCalibrationControllerState } from "../../../character/calibration/initialSincroCalibrationController";
import type { SincroAppController, SincroAppLifecycleState } from "../../controller";
import { useSincroMediaDeviceState } from "../../react/useSincroMediaDeviceState";
import type { PanelCameraGuideState } from "./panelCameraGuideState";
import type {
    ApplySettingsFn,
    PanelConnectionState,
    PanelGazeState,
    PanelLearnedVadState,
    PanelLookingGlassConfigStatus,
    PanelLookingGlassState,
    PanelRtcState,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./panelTypes";
import { useSincroPanelEventState } from "./useSincroPanelEventState";

type SincroPanelState = {
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
    vadState: "unknown" | "speech" | "silence";
    learnedVad: PanelLearnedVadState;
    gaze: PanelGazeState;
    rtcState: PanelRtcState;
    connectionState: PanelConnectionState;
    lookingGlass: PanelLookingGlassState;
    lookingGlassConfigStatus: PanelLookingGlassConfigStatus;
    cameraGuide: PanelCameraGuideState;
    calibrationState: InitialSincroCalibrationControllerState;
};

// Control Panel から呼ぶ UI 操作。実処理は AppController に集約し、hook は委譲のみ行う。
type SincroPanelActions = {
    startAction: () => void;
    stopAction: () => void;
    applySettings: ApplySettingsFn;
    changeTalkMode: (nextTalkMode: string) => void;
    retryCalibration: (stepId: InitialCalibrationStepId) => void;
    refreshDevices: ReturnType<typeof useSincroMediaDeviceState>["refreshDevices"];
};

// AppController のイベント購読を React state に集約する、ページ共通の表示用 hook。
// simple-vrm / vrm360 / looking-glass-vrm で同じ購読ロジックを再利用する。
export function useSincroPanelState(): SincroPanelState & SincroPanelActions {
    const eventState = useSincroPanelEventState();
    const [calibrationState, setCalibrationState] =
        useState<InitialSincroCalibrationControllerState>(
            eventState.currentController?.calibration.getState() ?? { status: "idle" },
        );
    useEffect(() => {
        const controller = eventState.currentController;
        if (!controller) {
            setCalibrationState({ status: "idle" });
            return;
        }
        return controller.calibration.subscribe(setCalibrationState);
    }, [eventState.currentController]);
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
        eventState.currentController?.start();
    };
    const stopAction = (): void => {
        eventState.currentController?.stop();
    };
    const applySettings: ApplySettingsFn = (partial) => {
        eventState.currentController?.applySettings(partial);
    };
    const changeTalkMode = (talkMode: string): void => {
        applySettings({ talkMode });
    };
    const retryCalibration = (stepId: InitialCalibrationStepId): void => {
        eventState.currentController?.calibration.retry(stepId);
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
