import { useEffect, useState } from "react";
import { SincroAppController } from "../../ts/App/SincroAppController";
import type {
    SincroAppEvent,
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
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

const defaultSettings: SincroAppSettingsSnapshot = {
    titleText: "Sincromisor",
    talkMode: "chat",
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
    lgTargetY: 1.25,
    lgTargetZ: 0.5,
    lgTargetDiam: 0.85,
    lgDepthiness: 1.0,
    lgFovyDeg: 25,
};

const defaultSettingsUiState: SincroAppSettingsUiState = {
    titleTextDisabled: false,
    talkModeDisabled: false,
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
};

const defaultSettingsUiHints: SincroAppSettingsUiHints = {};

type ConfigurationDialogEventHandlerMap = {
    [K in SincroAppEvent["type"]]?: (event: Extract<SincroAppEvent, { type: K; }>) => void;
};

// dialog 用の最小購読 hook。Control Panel 用 hook の全状態を持たず、settings 系 + VRM UI状態だけを扱う。
export function useConfigurationDialogSettingsState() {
    const initialController = SincroAppController.getCurrent();
    const [currentController, setCurrentController] = useState<SincroAppController | null>(initialController);
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

    useEffect(() => {
        SincroAppController.getCurrent()?.dialog.setReactPrimarySettingsEnabled(true);
        const eventHandlers: ConfigurationDialogEventHandlerMap = {
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
        settings,
        settingsUiState,
        settingsUiHints,
        dialogVrmUiState,
        dialogUiState,
        applySettings,
        changeTalkMode,
        openVrmFilePicker,
        startApp,
        closeDialog,
    };
}
