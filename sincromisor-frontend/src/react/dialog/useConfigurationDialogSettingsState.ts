import { SincroAppController } from "../../ts/App/SincroAppController";
import { useSincroMediaDeviceState } from "../app/useSincroMediaDeviceState";
import { buildConfigurationDialogActions } from "./configurationDialogActions";
import { useConfigurationDialogControllerSubscription } from "./configurationDialogEventSubscription";
import {
    useConfigurationDialogControllerState,
    useConfigurationDialogSettingsSnapshots,
    useConfigurationDialogStateSetters,
    useConfigurationDialogUiSnapshots,
} from "./configurationDialogStateGroups";

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
