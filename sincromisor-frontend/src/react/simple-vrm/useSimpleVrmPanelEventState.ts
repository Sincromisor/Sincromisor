import { useEffect, useMemo, useState } from "react";
import { SincroAppController } from "../../ts/App/SincroAppController";
import type { SincroAppEvent, SincroAppLifecycleState } from "../../ts/App/SincroAppTypes";
import { subscribeActiveSincroAppEvents } from "../app/subscribeActiveSincroAppEvents";
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
    defaultSimpleVrmPanelConnectionState,
    defaultSimpleVrmPanelLookingGlassConfigStatus,
    defaultSimpleVrmPanelLookingGlassState,
    defaultSimpleVrmPanelRtcState,
    defaultSimpleVrmPanelSettings,
    defaultSimpleVrmPanelSettingsUiHints,
    defaultSimpleVrmPanelSettingsUiState,
    defaultSimpleVrmPanelStartupSettingsCapabilities,
    defaultSimpleVrmPanelStartupSettingsStatus,
} from "./simpleVrmPanelDefaults";
import {
    createSimpleVrmPanelEventHandlers,
    type SimpleVrmPanelControllerEventSetters,
    type SimpleVrmPanelRuntimeEventSetters,
    syncSimpleVrmPanelController,
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
};

type SimpleVrmPanelControllerEventState = {
    hasActiveController: boolean;
    currentController: SincroAppController | undefined;
    lifecycleState: SincroAppLifecycleState;
    settings: SincroAppSettingsSnapshot;
    settingsUiState: SincroAppSettingsUiState;
    settingsUiHints: SincroAppSettingsUiHints;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
    startupSettingsCapabilities: SincroAppStartupSettingsCapabilities;
};

type SimpleVrmPanelRuntimeEventState = {
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
};

function useSimpleVrmPanelControllerEventState(
    initialController: SincroAppController | undefined,
): {
    state: SimpleVrmPanelControllerEventState;
    setters: SimpleVrmPanelControllerEventSetters;
} {
    const [hasActiveController, setHasActiveController] = useState<boolean>(!!initialController);
    const [currentController, setCurrentController] = useState<SincroAppController | undefined>(
        initialController,
    );
    const [lifecycleState, setLifecycleState] = useState<SincroAppLifecycleState>("idle");
    const [settings, setSettings] = useState<SincroAppSettingsSnapshot>(
        initialController?.state.getSettingsSnapshot() ?? defaultSimpleVrmPanelSettings,
    );
    const [settingsUiState, setSettingsUiState] = useState<SincroAppSettingsUiState>(
        initialController?.state.getSettingsUiState() ?? defaultSimpleVrmPanelSettingsUiState,
    );
    const [settingsUiHints, setSettingsUiHints] = useState<SincroAppSettingsUiHints>(
        initialController?.state.getSettingsUiHints() ?? defaultSimpleVrmPanelSettingsUiHints,
    );
    const [startupSettingsStatus, setStartupSettingsStatus] =
        useState<SincroAppStartupSettingsStatus>(
            initialController?.state.getStartupSettingsStatus() ??
                defaultSimpleVrmPanelStartupSettingsStatus,
        );
    const [startupSettingsCapabilities, setStartupSettingsCapabilities] =
        useState<SincroAppStartupSettingsCapabilities>(
            defaultSimpleVrmPanelStartupSettingsCapabilities,
        );
    const setters = useMemo<SimpleVrmPanelControllerEventSetters>(
        () => ({
            setHasActiveController,
            setCurrentController,
            setLifecycleState,
            setSettings,
            setSettingsUiState,
            setSettingsUiHints,
            setStartupSettingsStatus,
            setStartupSettingsCapabilities,
        }),
        [],
    );

    return {
        state: {
            hasActiveController,
            currentController,
            lifecycleState,
            settings,
            settingsUiState,
            settingsUiHints,
            startupSettingsStatus,
            startupSettingsCapabilities,
        },
        setters,
    };
}

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
    const [connectionState, setConnectionState] = useState<PanelConnectionState>(
        defaultSimpleVrmPanelConnectionState,
    );
    const [telopLogs, setTelopLogs] = useState<PanelTelopLog[]>([]);
    const [lookingGlass, setLookingGlass] = useState<PanelLookingGlassState>(
        defaultSimpleVrmPanelLookingGlassState,
    );
    const [lookingGlassConfigStatus, setLookingGlassConfigStatus] =
        useState<PanelLookingGlassConfigStatus>(defaultSimpleVrmPanelLookingGlassConfigStatus);
    const setters = useMemo<SimpleVrmPanelRuntimeEventSetters>(
        () => ({
            setLogs,
            setVadState,
            setLearnedVad,
            setGaze,
            setRtcEvents,
            setRtcState,
            setConnectionState,
            setTelopLogs,
            setLookingGlass,
            setLookingGlassConfigStatus,
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
            connectionState,
            telopLogs,
            lookingGlass,
            lookingGlassConfigStatus,
        },
        setters,
    };
}

// AppController event を control panel 表示用 state に正規化する。
export function useSimpleVrmPanelEventState(): SimpleVrmPanelEventState {
    const initialController = SincroAppController.getCurrent();
    const controllerEventState = useSimpleVrmPanelControllerEventState(initialController);
    const runtimeEventState = useSimpleVrmPanelRuntimeEventState();

    useEffect(() => {
        const eventHandlers = createSimpleVrmPanelEventHandlers(
            controllerEventState.setters,
            runtimeEventState.setters,
        );

        const unsubscribeActiveController = subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                syncSimpleVrmPanelController(controller, controllerEventState.setters);
            },
            onEvent: (event: SincroAppEvent) => {
                const handler = eventHandlers[event.type] as
                    | ((value: SincroAppEvent) => void)
                    | undefined;
                handler?.(event);
            },
        });
        return () => unsubscribeActiveController();
    }, [controllerEventState.setters, runtimeEventState.setters]);

    return {
        ...controllerEventState.state,
        ...runtimeEventState.state,
    };
}
