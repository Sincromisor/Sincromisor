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
    PanelMessageLog,
    PanelRtcState,
    PanelTelopLog,
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
};

type SimpleVrmPanelRuntimeEventState = {
    logs: PanelMessageLog[];
    vadState: "unknown" | "speech" | "silence";
    learnedVad: PanelLearnedVadState;
    gaze: PanelGazeState;
    rtcEvents: string[];
    rtcState: PanelRtcState;
    telopLogs: PanelTelopLog[];
    lookingGlass: PanelLookingGlassState;
    lookingGlassConfigStatus: PanelLookingGlassConfigStatus;
    cameraGuide: PanelCameraGuideState;
};

function useSimpleVrmPanelRuntimeEventState(): {
    state: SimpleVrmPanelRuntimeEventState;
    setters: SimpleVrmPanelRuntimeEventSetters;
} {
    const [logs, setLogs] = useState<PanelMessageLog[]>([]);
    const [vadState, setVadState] = useState<"unknown" | "speech" | "silence">("unknown");
    const [learnedVad, setLearnedVad] = useState<PanelLearnedVadState>({ status: "idle" });
    const [gaze, setGaze] = useState<PanelGazeState>({});
    const [rtcEvents, setRtcEvents] = useState<string[]>([]);
    const [rtcState, setRtcState] = useState<PanelRtcState>(defaultSimpleVrmPanelRtcState);
    const [telopLogs, setTelopLogs] = useState<PanelTelopLog[]>([]);
    const [lookingGlass, setLookingGlass] = useState<PanelLookingGlassState>(
        defaultSimpleVrmPanelLookingGlassState,
    );
    const [lookingGlassConfigStatus, setLookingGlassConfigStatus] =
        useState<PanelLookingGlassConfigStatus>(defaultSimpleVrmPanelLookingGlassConfigStatus);
    const [cameraGuide, setCameraGuide] = useState<PanelCameraGuideState>(
        createPanelCameraGuideState,
    );
    const setters = useMemo<SimpleVrmPanelRuntimeEventSetters>(
        () => ({
            setLogs,
            setVadState,
            setLearnedVad,
            setGaze,
            setRtcEvents,
            setRtcState,
            setTelopLogs,
            setLookingGlass,
            setLookingGlassConfigStatus,
            setCameraGuide,
        }),
        [],
    );

    return {
        state: {
            logs,
            vadState,
            learnedVad,
            gaze,
            rtcEvents,
            rtcState,
            telopLogs,
            lookingGlass,
            lookingGlassConfigStatus,
            cameraGuide,
        },
        setters,
    };
}

// AppController event を control panel 表示用 state に正規化する。
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
