import { useCallback } from "react";
import type { SincroAppController, SincroAppEvent } from "../../../app/controller";
import { getActiveSincroAppController } from "../../../app/controller/activeSincroAppController";
import { useSincroAppControllerSettingsState } from "../../../app/react/useSincroAppControllerSettingsState";
import { useSincroMediaDeviceState } from "../../../app/react/useSincroMediaDeviceState";
import { buildConfigurationDialogActions } from "./configurationDialogActions";
import {
    applyConfigurationDialogUiEvent,
    hydrateConfigurationDialogUiFromController,
} from "./configurationDialogEventSubscription";
import {
    useConfigurationDialogStateSetters,
    useConfigurationDialogUiSnapshots,
} from "./configurationDialogStateGroups";

/** 起動前画面に必要な設定・機器・VRM選択を購読し、有効アプリへの操作を返す。 */
export function useConfigurationDialogSettingsState() {
    const initialController = getActiveSincroAppController();
    const dialogState = useConfigurationDialogUiSnapshots(initialController);
    const dialogSetters = useConfigurationDialogStateSetters(dialogState);
    const hydrateDialogUi = useCallback(
        (controller: SincroAppController) => {
            hydrateConfigurationDialogUiFromController(controller, dialogSetters);
        },
        [dialogSetters],
    );
    const applyDialogUiEvent = useCallback(
        (event: SincroAppEvent) => {
            applyConfigurationDialogUiEvent(event, dialogSetters);
        },
        [dialogSetters],
    );
    const controllerState = useSincroAppControllerSettingsState({
        initialController,
        onControllerHydrated: hydrateDialogUi,
        onEvent: applyDialogUiEvent,
    });
    const {
        snapshot: mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
    } = useSincroMediaDeviceState({
        audioInputDeviceId: controllerState.settings.audioInputDeviceId,
        videoInputDeviceId: controllerState.settings.videoInputDeviceId,
    });

    const actions = buildConfigurationDialogActions(controllerState.currentController);

    return {
        currentController: controllerState.currentController,
        lifecycleState: controllerState.lifecycleState,
        connectionState: controllerState.connectionState,
        settings: controllerState.settings,
        settingsUiState: controllerState.settingsUiState,
        settingsUiHints: controllerState.settingsUiHints,
        dialogVrmUiState: dialogState.dialogVrmUiState,
        dialogUiState: dialogState.dialogUiState,
        startupSettingsStatus: controllerState.startupSettingsStatus,
        startupSettingsCapabilities: controllerState.startupSettingsCapabilities,
        mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
        ...actions,
    };
}
