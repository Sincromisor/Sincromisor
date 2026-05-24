import { useCallback } from "react";
import { SincroAppController, type SincroAppEvent } from "../../../app/controller";
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

// dialog 用の最小購読 hook。Control Panel 用 hook の全状態を持たず、settings 系 + VRM UI状態だけを扱う。
export function useConfigurationDialogSettingsState() {
    const initialController = SincroAppController.getCurrent();
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
