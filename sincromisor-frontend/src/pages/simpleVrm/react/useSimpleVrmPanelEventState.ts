import { useCallback, useMemo, useState } from "react";
import type { SincroAppEvent, SincroAppLifecycleState } from "../../../app/controller";
import { SincroAppController } from "../../../app/controller";
import { useSincroAppControllerSettingsState } from "../../../app/react/useSincroAppControllerSettingsState";
import { createPanelCameraGuideState, type PanelCameraGuideState } from "./panelCameraGuideState";
import type {
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
import {
    defaultSimpleVrmPanelLookingGlassConfigStatus,
    defaultSimpleVrmPanelLookingGlassState,
    defaultSimpleVrmPanelRtcState,
} from "./simpleVrmPanelDefaults";
import {
    createSimpleVrmPanelRuntimeEventHandlers,
    type SimpleVrmPanelRuntimeEventSetters,
} from "./simpleVrmPanelEventHandlers";

type SimpleVrmPanelEventState = {
    hasActiveController: boolean;
    currentController: SincroAppController | undefined;
    lifecycleState: SincroAppLifecycleState;
    settings: SincroAppSettingsSnapshot;
    settingsUiState: SincroAppSettingsUiState;
    settingsUiHints: SincroAppSettingsUiHints;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
    startupSettingsCapabilities: SincroAppStartupSettingsCapabilities;
    vadState: "unknown" | "speech" | "silence";
    learnedVad: PanelLearnedVadState;
    gaze: PanelGazeState;
    rtcState: PanelRtcState;
    connectionState: PanelConnectionState;
    lookingGlass: PanelLookingGlassState;
    lookingGlassConfigStatus: PanelLookingGlassConfigStatus;
    cameraGuide: PanelCameraGuideState;
    vrmStatusText: string;
};

type SimpleVrmPanelRuntimeEventState = {
    vadState: "unknown" | "speech" | "silence";
    learnedVad: PanelLearnedVadState;
    gaze: PanelGazeState;
    rtcState: PanelRtcState;
    lookingGlass: PanelLookingGlassState;
    lookingGlassConfigStatus: PanelLookingGlassConfigStatus;
    cameraGuide: PanelCameraGuideState;
    vrmStatusText: string;
};

/** 購読中のパネルで表示する現在状態と、参照が安定した更新窓口を保持する。 */
function useSimpleVrmPanelRuntimeEventState(): {
    state: SimpleVrmPanelRuntimeEventState;
    setters: SimpleVrmPanelRuntimeEventSetters;
} {
    const [vadState, setVadState] = useState<"unknown" | "speech" | "silence">("unknown");
    const [learnedVad, setLearnedVad] = useState<PanelLearnedVadState>({ status: "idle" });
    const [gaze, setGaze] = useState<PanelGazeState>({});
    const [rtcState, setRtcState] = useState<PanelRtcState>(defaultSimpleVrmPanelRtcState);
    const [lookingGlass, setLookingGlass] = useState<PanelLookingGlassState>(
        defaultSimpleVrmPanelLookingGlassState,
    );
    const [lookingGlassConfigStatus, setLookingGlassConfigStatus] =
        useState<PanelLookingGlassConfigStatus>(defaultSimpleVrmPanelLookingGlassConfigStatus);
    const [cameraGuide, setCameraGuide] = useState<PanelCameraGuideState>(
        createPanelCameraGuideState,
    );
    const [vrmStatusText, setVrmStatusText] = useState("");
    const setters = useMemo<SimpleVrmPanelRuntimeEventSetters>(
        () => ({
            setVadState,
            setLearnedVad,
            setGaze,
            setRtcState,
            setLookingGlass,
            setLookingGlassConfigStatus,
            setCameraGuide,
            setVrmStatusText,
        }),
        [],
    );

    return {
        state: {
            vadState,
            learnedVad,
            gaze,
            rtcState,
            lookingGlass,
            lookingGlassConfigStatus,
            cameraGuide,
            vrmStatusText,
        },
        setters,
    };
}

/** 有効アプリの通知をパネル表示へ反映し、解除時に古いカメラ案内を消す。 */
export function useSimpleVrmPanelEventState(): SimpleVrmPanelEventState {
    const initialController = SincroAppController.getCurrent();
    const runtimeEventState = useSimpleVrmPanelRuntimeEventState();
    const eventHandlers = useMemo(
        () => createSimpleVrmPanelRuntimeEventHandlers(runtimeEventState.setters),
        [runtimeEventState.setters],
    );
    const applyRuntimeEvent = useCallback(
        (event: SincroAppEvent) => {
            const handler = eventHandlers[event.type] as
                | ((value: SincroAppEvent) => void)
                | undefined;
            handler?.(event);
        },
        [eventHandlers],
    );
    const controllerEventState = useSincroAppControllerSettingsState({
        initialController,
        resetLifecycleOnControllerClear: true,
        onEvent: applyRuntimeEvent,
        onControllerCleared: () =>
            runtimeEventState.setters.setCameraGuide(createPanelCameraGuideState()),
    });

    return {
        ...controllerEventState,
        ...runtimeEventState.state,
    };
}
