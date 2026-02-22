import type {
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppLookingGlassConfigStatus,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsStatus,
} from "./SincroAppTypes";

export function emitSincroAppLifecycle(
    emit: (event: SincroAppEvent) => void,
    state: SincroAppLifecycleState,
    startupSettingsStatus: SincroAppStartupSettingsStatus,
): void {
    emit({ type: "lifecycle", state });
    emit({ type: "startup_settings_status", status: startupSettingsStatus });
}

export function emitSincroAppSettingsRelatedSnapshots(
    emit: (event: SincroAppEvent) => void,
    payload: {
        settings: SincroAppSettingsSnapshot;
        settingsUiState: SincroAppSettingsUiState;
        settingsUiHints: SincroAppSettingsUiHints;
        startupSettingsStatus: SincroAppStartupSettingsStatus;
    },
): void {
    emit({ type: "settings_snapshot", settings: payload.settings });
    emit({ type: "settings_ui_state", uiState: payload.settingsUiState });
    emit({ type: "settings_ui_hints", uiHints: payload.settingsUiHints });
    emit({ type: "startup_settings_status", status: payload.startupSettingsStatus });
}

export function emitSincroAppSettingsApplyEvents(
    emit: (event: SincroAppEvent) => void,
    payload: {
        settings: SincroAppSettingsSnapshot;
        settingsUiState: SincroAppSettingsUiState;
        settingsUiHints: SincroAppSettingsUiHints;
        startupSettingsStatus: SincroAppStartupSettingsStatus;
        lookingGlassConfigStatus: SincroAppLookingGlassConfigStatus;
    },
): void {
    emitSincroAppSettingsRelatedSnapshots(emit, payload);
    emit({ type: "looking_glass_config_status", status: payload.lookingGlassConfigStatus });
}

export function emitSincroAppConnectionState(
    emit: (event: SincroAppEvent) => void,
    event: SincroAppEvent,
): void {
    emit(event);
}
