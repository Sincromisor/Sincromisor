import { useEffect, useState } from "react";
import { SincroAppController } from "../../ts/App/SincroAppController";
import type {
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../../ts/App/SincroAppTypes";
import type {
    ApplySettingsFn,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../app/appSettingsTypes";
import { subscribeActiveSincroAppEvents } from "../app/subscribeActiveSincroAppEvents";
import {
    hydrateDialogUiSnapshotsFromController,
    hydrateSettingsSnapshotsFromController,
} from "../app/sincroAppStateSnapshotHydrators";
import { useSincroMediaDeviceState } from "../app/useSincroMediaDeviceState";

const defaultSettings: SincroAppSettingsSnapshot = {
    titleText: "Sincromisor",
    talkMode: "chat",
    audioInputDeviceId: null,
    videoInputDeviceId: null,
    enableCharacter: true,
    enableTalk: true,
    enableCharacterGaze: true,
    enableAutoMute: false,
    enableNoiseSuppression: true,
    enableEchoCancellation: true,
    enableAutoGainControl: false,
    enableVadGate: false,
    enableVenueNoiseMode: false,
    enableInspector: false,
    enableVR: false,
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
    startButtonText: "はじめる",
    startButtonHint: null,
};

const defaultSettingsUiHints: SincroAppSettingsUiHints = {};
const defaultStartupSettingsStatus: SincroAppStartupSettingsStatus = {
    requiresRestart: false,
    willApplyOnNextStart: false,
    changedKeys: [],
};
const defaultStartupSettingsCapabilities: SincroAppStartupSettingsCapabilities = {
    enableTalk: true,
    enableInspector: true,
    enableVR: true,
};
const defaultConnectionState: {
    value: "idle" | "starting" | "connecting" | "connected" | "degraded" | "stopping" | "stopped";
    detail: string;
} = { value: "idle", detail: "" };

type ConfigurationDialogEventHandlerMap = {
    [K in SincroAppEvent["type"]]?: (event: Extract<SincroAppEvent, { type: K; }>) => void;
};

// dialog 用の最小購読 hook。Control Panel 用 hook の全状態を持たず、settings 系 + VRM UI状態だけを扱う。
export function useConfigurationDialogSettingsState() {
    const initialController = SincroAppController.getCurrent();
    const [currentController, setCurrentController] = useState<SincroAppController | null>(initialController);
    const [lifecycleState, setLifecycleState] = useState<SincroAppLifecycleState>("idle");
    const [connectionState, setConnectionState] = useState(defaultConnectionState);
    const [settings, setSettings] = useState<SincroAppSettingsSnapshot>(
        initialController?.state.getSettingsSnapshot() ?? defaultSettings,
    );
    const [settingsUiState, setSettingsUiState] = useState<SincroAppSettingsUiState>(
        initialController?.state.getSettingsUiState() ?? defaultSettingsUiState,
    );
    const [settingsUiHints, setSettingsUiHints] = useState<SincroAppSettingsUiHints>(
        initialController?.state.getSettingsUiHints() ?? defaultSettingsUiHints,
    );
    const [dialogVrmUiState, setDialogVrmUiState] = useState<SincroAppDialogVrmUiState>(
        initialController?.state.getDialogVrmUiState() ?? defaultDialogVrmUiState,
    );
    const [dialogUiState, setDialogUiState] = useState<SincroAppDialogUiState>(
        initialController?.state.getDialogUiState() ?? defaultDialogUiState,
    );
    const [startupSettingsStatus, setStartupSettingsStatus] = useState<SincroAppStartupSettingsStatus>(
        initialController?.state.getStartupSettingsStatus() ?? defaultStartupSettingsStatus,
    );
    const [startupSettingsCapabilities, setStartupSettingsCapabilities] = useState<SincroAppStartupSettingsCapabilities>(
        defaultStartupSettingsCapabilities,
    );
    const {
        snapshot: mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
    } = useSincroMediaDeviceState({
        audioInputDeviceId: settings.audioInputDeviceId,
        videoInputDeviceId: settings.videoInputDeviceId,
    });

    useEffect(() => {
        // 起動前 dialog は React を主表示にするため、mount 中は bridge DOM を非表示化する。
        SincroAppController.getCurrent()?.dialog.setReactPrimarySettingsEnabled(true);
        const eventHandlers: ConfigurationDialogEventHandlerMap = {
            lifecycle: (event) => {
                setLifecycleState(event.state);
            },
            connection_state: (event) => {
                setConnectionState({ value: event.value, detail: event.detail ?? "" });
            },
            settings_snapshot: (event) => {
                setSettings((prev) => ({ ...prev, ...event.settings }));
            },
            settings_ui_state: (event) => {
                setSettingsUiState(event.uiState);
            },
            settings_ui_hints: (event) => {
                setSettingsUiHints(event.uiHints);
            },
            dialog_vrm_ui_state: (event) => {
                setDialogVrmUiState(event.uiState);
            },
            dialog_ui_state: (event) => {
                setDialogUiState(event.uiState);
            },
            startup_settings_status: (event) => {
                setStartupSettingsStatus(event.status);
            },
            startup_settings_capabilities: (event) => {
                setStartupSettingsCapabilities(event.capabilities);
            },
        };
        const unsubscribeActiveController = subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                setCurrentController(controller);
                if (!controller) {
                    return;
                }
                // active controller 差し替え時も subscribe 初回イベント前に最低限の snapshot を反映して空白を減らす。
                hydrateSettingsSnapshotsFromController(controller, {
                    setSettings,
                    setSettingsUiState,
                    setSettingsUiHints,
                });
                hydrateDialogUiSnapshotsFromController(controller, {
                    setDialogUiState,
                    setDialogVrmUiState,
                });
                setStartupSettingsStatus(controller.state.getStartupSettingsStatus());
            },
            onBeforeSubscribe: (controller) => {
                controller.dialog.setReactPrimarySettingsEnabled(true);
            },
            onEvent: (event: SincroAppEvent) => {
                const handler = eventHandlers[event.type] as ((value: SincroAppEvent) => void) | undefined;
                handler?.(event);
            },
        });
        return () => {
            unsubscribeActiveController();
            // unmount 時に bridge DOM を戻しておく（フォールバック/開発時の安全策）。
            SincroAppController.getCurrent()?.dialog.setReactPrimarySettingsEnabled(false);
        };
    }, []);

    const applySettings: ApplySettingsFn = (partial) => {
        currentController?.applySettings(partial);
    };

    const changeTalkMode = (nextTalkMode: string): void => {
        applySettings({ talkMode: nextTalkMode });
    };

    const openVrmFilePicker = (): void => {
        // file input 自体は bridge DOM に残しているので、操作は AppController.dialog へ委譲する。
        currentController?.dialog.openVrmFilePicker();
    };

    const startApp = (): void => {
        currentController?.start();
    };

    const closeDialog = (): void => {
        currentController?.dialog.close();
    };

    return {
        currentController,
        lifecycleState,
        connectionState,
        settings,
        settingsUiState,
        settingsUiHints,
        dialogVrmUiState,
        dialogUiState,
        startupSettingsStatus,
        startupSettingsCapabilities,
        mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
        applySettings,
        changeTalkMode,
        openVrmFilePicker,
        startApp,
        closeDialog,
    };
}
