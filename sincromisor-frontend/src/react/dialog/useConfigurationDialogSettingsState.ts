import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { SincroAppController } from "../../ts/App/SincroAppController";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../../ts/App/SincroAppTypes";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../app/appSettingsTypes";
import {
    hydrateDialogUiSnapshotsFromController,
    hydrateSettingsSnapshotsFromController,
} from "../app/sincroAppStateSnapshotHydrators";
import { subscribeActiveSincroAppEvents } from "../app/subscribeActiveSincroAppEvents";
import { useSincroMediaDeviceState } from "../app/useSincroMediaDeviceState";

const defaultSettings: SincroAppSettingsSnapshot = {
    titleText: "Sincromisor",
    talkMode: "chat",
    audioInputDeviceId: undefined,
    videoInputDeviceId: undefined,
    enableCharacter: true,
    enableTalk: true,
    enableCharacterGaze: true,
    enableSincroPoseTracking: true,
    forceSincroPoseTracking: false,
    enableAutoMute: false,
    enableNoiseSuppression: true,
    enableEchoCancellation: true,
    enableAutoGainControl: false,
    enableVadGate: false,
    enableVenueNoiseMode: false,
    enableInspector: false,
    enableVR: false,
    characterMotionScale: 0.72,
    sincroPoseRetargetScale: 0.68,
    characterEyeTrackingScale: 0.68,
    lgTileHeight: 512,
    lgNumViews: 45,
    lgTargetY: 0.95,
    lgTargetZ: 0.05,
    lgTargetDiam: 1.25,
    lgDepthiness: 0.85,
    lgFovyDeg: 24,
};

const defaultSettingsUiState: SincroAppSettingsUiState = {
    titleTextDisabled: false,
    talkModeDisabled: false,
    audioInputDeviceDisabled: false,
    videoInputDeviceDisabled: false,
    enableCharacterDisabled: false,
    enableTalkDisabled: false,
    enableCharacterGazeDisabled: false,
    forceSincroPoseTrackingDisabled: false,
    enableAutoMuteDisabled: false,
    enableNoiseSuppressionDisabled: false,
    enableEchoCancellationDisabled: false,
    enableAutoGainControlDisabled: false,
    enableVadGateDisabled: false,
    enableVenueNoiseModeDisabled: false,
    enableInspectorDisabled: false,
    enableVRDisabled: false,
};

const defaultDialogVrmUiState: SincroAppDialogVrmUiState = {
    isDragOver: false,
    vrmStatusText: "既定のVRMモデルを使用中",
};
const defaultDialogUiState: SincroAppDialogUiState = {
    isOpen: false,
    startButtonDisabled: false,
    startButtonText: "開始する",
};

const defaultSettingsUiHints: SincroAppSettingsUiHints = {};
const defaultStartupSettingsStatus: SincroAppStartupSettingsStatus = {
    requiresRestart: false,
    willApplyOnNextStart: false,
    changedKeys: [],
};
const defaultStartupSettingsCapabilities: SincroAppStartupSettingsCapabilities = {
    enableTalk: false,
    enableInspector: false,
    enableVR: false,
};
const defaultConnectionState: {
    value: "idle" | "starting" | "connecting" | "connected" | "degraded" | "stopping" | "stopped";
    detail: string;
} = { value: "idle", detail: "" };

type ConfigurationDialogStateSetters = {
    setCurrentController: Dispatch<SetStateAction<SincroAppController | undefined>>;
    setLifecycleState: Dispatch<SetStateAction<SincroAppLifecycleState>>;
    setConnectionState: Dispatch<SetStateAction<typeof defaultConnectionState>>;
    setSettings: Dispatch<SetStateAction<SincroAppSettingsSnapshot>>;
    setSettingsUiState: Dispatch<SetStateAction<SincroAppSettingsUiState>>;
    setSettingsUiHints: Dispatch<SetStateAction<SincroAppSettingsUiHints>>;
    setDialogVrmUiState: Dispatch<SetStateAction<SincroAppDialogVrmUiState>>;
    setDialogUiState: Dispatch<SetStateAction<SincroAppDialogUiState>>;
    setStartupSettingsStatus: Dispatch<SetStateAction<SincroAppStartupSettingsStatus>>;
    setStartupSettingsCapabilities: Dispatch<SetStateAction<SincroAppStartupSettingsCapabilities>>;
};

// dialog 用の最小購読 hook。Control Panel 用 hook の全状態を持たず、settings 系 + VRM UI状態だけを扱う。
export function useConfigurationDialogSettingsState() {
    const initialController = SincroAppController.getCurrent();
    const controllerState = useConfigurationDialogControllerState(initialController);
    const settingsState = useConfigurationDialogSettingsSnapshots(initialController);
    const dialogState = useConfigurationDialogUiSnapshots(initialController);
    const {
        snapshot: mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
    } = useSincroMediaDeviceState({
        audioInputDeviceId: settingsState.settings.audioInputDeviceId,
        videoInputDeviceId: settingsState.settings.videoInputDeviceId,
    });

    const stateSetters = useConfigurationDialogStateSetters(
        controllerState,
        settingsState,
        dialogState,
    );
    useConfigurationDialogControllerSubscription(stateSetters);
    const actions = buildConfigurationDialogActions(controllerState.currentController);

    return {
        currentController: controllerState.currentController,
        lifecycleState: controllerState.lifecycleState,
        connectionState: controllerState.connectionState,
        settings: settingsState.settings,
        settingsUiState: settingsState.settingsUiState,
        settingsUiHints: settingsState.settingsUiHints,
        dialogVrmUiState: dialogState.dialogVrmUiState,
        dialogUiState: dialogState.dialogUiState,
        startupSettingsStatus: settingsState.startupSettingsStatus,
        startupSettingsCapabilities: settingsState.startupSettingsCapabilities,
        mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
        ...actions,
    };
}

function useConfigurationDialogStateSetters(
    controllerState: ReturnType<typeof useConfigurationDialogControllerState>,
    settingsState: ReturnType<typeof useConfigurationDialogSettingsSnapshots>,
    dialogState: ReturnType<typeof useConfigurationDialogUiSnapshots>,
): ConfigurationDialogStateSetters {
    return useMemo(
        () => ({
            setCurrentController: controllerState.setCurrentController,
            setLifecycleState: controllerState.setLifecycleState,
            setConnectionState: controllerState.setConnectionState,
            setSettings: settingsState.setSettings,
            setSettingsUiState: settingsState.setSettingsUiState,
            setSettingsUiHints: settingsState.setSettingsUiHints,
            setDialogVrmUiState: dialogState.setDialogVrmUiState,
            setDialogUiState: dialogState.setDialogUiState,
            setStartupSettingsStatus: settingsState.setStartupSettingsStatus,
            setStartupSettingsCapabilities: settingsState.setStartupSettingsCapabilities,
        }),
        [
            controllerState.setCurrentController,
            controllerState.setLifecycleState,
            controllerState.setConnectionState,
            settingsState.setSettings,
            settingsState.setSettingsUiState,
            settingsState.setSettingsUiHints,
            dialogState.setDialogVrmUiState,
            dialogState.setDialogUiState,
            settingsState.setStartupSettingsStatus,
            settingsState.setStartupSettingsCapabilities,
        ],
    );
}

function buildConfigurationDialogActions(currentController: SincroAppController | undefined) {
    const applySettings: ApplySettingsFn = (partial) => {
        currentController?.applySettings(partial);
    };
    return {
        applySettings,
        changeTalkMode: (nextTalkMode: string): void => {
            applySettings({ talkMode: nextTalkMode });
        },
        applySelectedVrmFile: (file: File): void => {
            currentController?.dialog.applySelectedVrmFile(file);
        },
        setVrmDragOver: (isDragOver: boolean): void => {
            currentController?.dialog.setVrmDragOver(isDragOver);
        },
        startApp: (): void => {
            currentController?.start();
        },
    };
}

function useConfigurationDialogControllerState(initialController: SincroAppController | undefined) {
    const [currentController, setCurrentController] = useState<SincroAppController | undefined>(
        initialController,
    );
    const [lifecycleState, setLifecycleState] = useState<SincroAppLifecycleState>("idle");
    const [connectionState, setConnectionState] = useState(defaultConnectionState);
    return useMemo(
        () => ({
            currentController,
            lifecycleState,
            connectionState,
            setCurrentController,
            setLifecycleState,
            setConnectionState,
        }),
        [currentController, lifecycleState, connectionState],
    );
}

function useConfigurationDialogSettingsSnapshots(
    initialController: SincroAppController | undefined,
) {
    const [settings, setSettings] = useState<SincroAppSettingsSnapshot>(
        initialController?.state.getSettingsSnapshot() ?? defaultSettings,
    );
    const [settingsUiState, setSettingsUiState] = useState<SincroAppSettingsUiState>(
        initialController?.state.getSettingsUiState() ?? defaultSettingsUiState,
    );
    const [settingsUiHints, setSettingsUiHints] = useState<SincroAppSettingsUiHints>(
        initialController?.state.getSettingsUiHints() ?? defaultSettingsUiHints,
    );
    const [startupSettingsStatus, setStartupSettingsStatus] =
        useState<SincroAppStartupSettingsStatus>(
            initialController?.state.getStartupSettingsStatus() ?? defaultStartupSettingsStatus,
        );
    const [startupSettingsCapabilities, setStartupSettingsCapabilities] =
        useState<SincroAppStartupSettingsCapabilities>(defaultStartupSettingsCapabilities);
    return useMemo(
        () => ({
            settings,
            settingsUiState,
            settingsUiHints,
            startupSettingsStatus,
            startupSettingsCapabilities,
            setSettings,
            setSettingsUiState,
            setSettingsUiHints,
            setStartupSettingsStatus,
            setStartupSettingsCapabilities,
        }),
        [
            settings,
            settingsUiState,
            settingsUiHints,
            startupSettingsStatus,
            startupSettingsCapabilities,
        ],
    );
}

function useConfigurationDialogUiSnapshots(initialController: SincroAppController | undefined) {
    const [dialogVrmUiState, setDialogVrmUiState] = useState<SincroAppDialogVrmUiState>(
        initialController?.state.getDialogVrmUiState() ?? defaultDialogVrmUiState,
    );
    const [dialogUiState, setDialogUiState] = useState<SincroAppDialogUiState>(
        initialController?.state.getDialogUiState() ?? defaultDialogUiState,
    );
    return useMemo(
        () => ({
            dialogVrmUiState,
            dialogUiState,
            setDialogVrmUiState,
            setDialogUiState,
        }),
        [dialogVrmUiState, dialogUiState],
    );
}

function useConfigurationDialogControllerSubscription(
    setters: ConfigurationDialogStateSetters,
): void {
    useEffect(() => {
        const unsubscribeActiveController = subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                hydrateConfigurationDialogFromController(controller, setters);
            },
            onEvent: (event) => {
                applyConfigurationDialogEvent(event, setters);
            },
        });
        return () => {
            unsubscribeActiveController();
        };
    }, [setters]);
}

function hydrateConfigurationDialogFromController(
    controller: SincroAppController | undefined,
    setters: ConfigurationDialogStateSetters,
): void {
    setters.setCurrentController(controller);
    if (!controller) {
        return;
    }
    // active controller 差し替え時も subscribe 初回イベント前に最低限の snapshot を反映して空白を減らす。
    hydrateSettingsSnapshotsFromController(controller, {
        setSettings: setters.setSettings,
        setSettingsUiState: setters.setSettingsUiState,
        setSettingsUiHints: setters.setSettingsUiHints,
    });
    hydrateDialogUiSnapshotsFromController(controller, {
        setDialogUiState: setters.setDialogUiState,
        setDialogVrmUiState: setters.setDialogVrmUiState,
    });
    setters.setStartupSettingsStatus(controller.state.getStartupSettingsStatus());
}

function applyConfigurationDialogEvent(
    event: SincroAppEvent,
    setters: ConfigurationDialogStateSetters,
): void {
    switch (event.type) {
        case "lifecycle":
            setters.setLifecycleState(event.state);
            return;
        case "connection_state":
            setters.setConnectionState({ value: event.value, detail: event.detail ?? "" });
            return;
        case "settings_snapshot":
            setters.setSettings((prev) => ({ ...prev, ...event.settings }));
            return;
        case "settings_ui_state":
            setters.setSettingsUiState(event.uiState);
            return;
        case "settings_ui_hints":
            setters.setSettingsUiHints(event.uiHints);
            return;
        case "dialog_vrm_ui_state":
            setters.setDialogVrmUiState(event.uiState);
            return;
        case "dialog_ui_state":
            setters.setDialogUiState(event.uiState);
            return;
        case "startup_settings_status":
            setters.setStartupSettingsStatus(event.status);
            return;
        case "startup_settings_capabilities":
            setters.setStartupSettingsCapabilities(event.capabilities);
            return;
        default:
            return;
    }
}
