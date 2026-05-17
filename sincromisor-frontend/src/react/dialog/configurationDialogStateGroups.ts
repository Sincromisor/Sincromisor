import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import type { SincroAppController } from "../../ts/App/SincroAppController";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppLifecycleState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../../ts/App/SincroAppTypes";
import type {
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../app/appSettingsTypes";
import {
    type ConfigurationDialogConnectionState,
    defaultConnectionState,
    defaultDialogUiState,
    defaultDialogVrmUiState,
    defaultSettings,
    defaultSettingsUiHints,
    defaultSettingsUiState,
    defaultStartupSettingsCapabilities,
    defaultStartupSettingsStatus,
} from "./configurationDialogStateDefaults";

export type ConfigurationDialogStateSetters = {
    setCurrentController: Dispatch<SetStateAction<SincroAppController | undefined>>;
    setLifecycleState: Dispatch<SetStateAction<SincroAppLifecycleState>>;
    setConnectionState: Dispatch<SetStateAction<ConfigurationDialogConnectionState>>;
    setSettings: Dispatch<SetStateAction<SincroAppSettingsSnapshot>>;
    setSettingsUiState: Dispatch<SetStateAction<SincroAppSettingsUiState>>;
    setSettingsUiHints: Dispatch<SetStateAction<SincroAppSettingsUiHints>>;
    setDialogVrmUiState: Dispatch<SetStateAction<SincroAppDialogVrmUiState>>;
    setDialogUiState: Dispatch<SetStateAction<SincroAppDialogUiState>>;
    setStartupSettingsStatus: Dispatch<SetStateAction<SincroAppStartupSettingsStatus>>;
    setStartupSettingsCapabilities: Dispatch<SetStateAction<SincroAppStartupSettingsCapabilities>>;
};

export function useConfigurationDialogControllerState(
    initialController: SincroAppController | undefined,
) {
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

export function useConfigurationDialogSettingsSnapshots(
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

export function useConfigurationDialogUiSnapshots(
    initialController: SincroAppController | undefined,
) {
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

export function useConfigurationDialogStateSetters(
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
