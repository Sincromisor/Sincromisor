import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../../../app/controller";
import {
    createDefaultSincroAppSettingsSnapshot,
    createDefaultSincroAppSettingsUiState,
    createDefaultSincroAppStartupSettingsCapabilities,
    createDefaultSincroAppStartupSettingsStatus,
    defaultSincroAppDialogUiState,
    defaultSincroAppDialogVrmUiState,
    defaultSincroAppSettingsUiHints,
} from "../../../app/settings/sincroAppSettingsDefaults";

export type ConfigurationDialogConnectionState = {
    value: "idle" | "starting" | "connecting" | "connected" | "degraded" | "stopping" | "stopped";
    detail: string;
};

export const defaultSettings: SincroAppSettingsSnapshot = createDefaultSincroAppSettingsSnapshot();

export const defaultSettingsUiState: SincroAppSettingsUiState =
    createDefaultSincroAppSettingsUiState();

export const defaultDialogVrmUiState: SincroAppDialogVrmUiState = defaultSincroAppDialogVrmUiState;

export const defaultDialogUiState: SincroAppDialogUiState = defaultSincroAppDialogUiState;

export const defaultSettingsUiHints: SincroAppSettingsUiHints = defaultSincroAppSettingsUiHints;

export const defaultStartupSettingsStatus: SincroAppStartupSettingsStatus =
    createDefaultSincroAppStartupSettingsStatus();

export const defaultStartupSettingsCapabilities: SincroAppStartupSettingsCapabilities =
    createDefaultSincroAppStartupSettingsCapabilities();

export const defaultConnectionState: ConfigurationDialogConnectionState = {
    value: "idle",
    detail: "",
};
