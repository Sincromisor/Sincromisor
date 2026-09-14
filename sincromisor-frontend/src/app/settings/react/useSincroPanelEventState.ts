import { useCallback, useMemo, useState } from "react";
import type { SincroAppEvent, SincroAppLifecycleState } from "../../controller";
import { SincroAppController } from "../../controller";
import { useSincroAppControllerSettingsState } from "../../react/useSincroAppControllerSettingsState";
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
    defaultSincroPanelLookingGlassConfigStatus,
    defaultSincroPanelLookingGlassState,
    defaultSincroPanelRtcState,
} from "./sincroPanelDefaults";
import {
    createSincroPanelRuntimeEventHandlers,
    type SincroPanelRuntimeEventSetters,
} from "./sincroPanelEventHandlers";

type SincroPanelEventState = {
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
};

type SincroPanelRuntimeEventState = {
    vadState: "unknown" | "speech" | "silence";
    learnedVad: PanelLearnedVadState;
    gaze: PanelGazeState;
    rtcState: PanelRtcState;
    lookingGlass: PanelLookingGlassState;
    lookingGlassConfigStatus: PanelLookingGlassConfigStatus;
    cameraGuide: PanelCameraGuideState;
};

/** 購読中のパネルで表示する現在状態と、参照が安定した更新窓口を保持する。 */
function useSincroPanelRuntimeEventState(): {
    state: SincroPanelRuntimeEventState;
    setters: SincroPanelRuntimeEventSetters;
} {
    const [vadState, setVadState] = useState<"unknown" | "speech" | "silence">("unknown");
    const [learnedVad, setLearnedVad] = useState<PanelLearnedVadState>({ status: "idle" });
    const [gaze, setGaze] = useState<PanelGazeState>({});
    const [rtcState, setRtcState] = useState<PanelRtcState>(defaultSincroPanelRtcState);
    const [lookingGlass, setLookingGlass] = useState<PanelLookingGlassState>(
        defaultSincroPanelLookingGlassState,
    );
    const [lookingGlassConfigStatus, setLookingGlassConfigStatus] =
        useState<PanelLookingGlassConfigStatus>(defaultSincroPanelLookingGlassConfigStatus);
    const [cameraGuide, setCameraGuide] = useState<PanelCameraGuideState>(
        createPanelCameraGuideState,
    );
    const setters = useMemo<SincroPanelRuntimeEventSetters>(
        () => ({
            setVadState,
            setLearnedVad,
            setGaze,
            setRtcState,
            setLookingGlass,
            setLookingGlassConfigStatus,
            setCameraGuide,
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
        },
        setters,
    };
}

/** 有効アプリの通知をパネル表示へ反映し、解除時に古いカメラ案内を消す。 */
export function useSincroPanelEventState(): SincroPanelEventState {
    const initialController = SincroAppController.getCurrent();
    const runtimeEventState = useSincroPanelRuntimeEventState();
    const eventHandlers = useMemo(
        () => createSincroPanelRuntimeEventHandlers(runtimeEventState.setters),
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
