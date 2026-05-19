import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppLookingGlassConfigStatus,
    SincroAppLookingGlassEventDetail,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./sincroAppTypes";

export type SincroAppInitialSnapshot = {
    lifecycleState: SincroAppLifecycleState;
    settings: SincroAppSettingsSnapshot;
    settingsUiState: SincroAppSettingsUiState;
    settingsUiHints: SincroAppSettingsUiHints;
    dialogUiState: SincroAppDialogUiState;
    dialogVrmUiState: SincroAppDialogVrmUiState;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
    startupSettingsCapabilities: SincroAppStartupSettingsCapabilities;
    lookingGlassState: SincroAppLookingGlassEventDetail;
    lookingGlassConfigStatus: SincroAppLookingGlassConfigStatus;
    connectionStateEvent: SincroAppEvent;
};

// subscribe直後に送る初期イベント群を helper 側で列挙し、AppController の見通しを保つ。
export function emitSincroAppInitialSnapshot(
    listener: (event: SincroAppEvent) => void,
    snapshot: SincroAppInitialSnapshot,
): void {
    listener({ type: "lifecycle", state: snapshot.lifecycleState });
    listener({ type: "settings_snapshot", settings: snapshot.settings });
    listener({ type: "settings_ui_state", uiState: snapshot.settingsUiState });
    listener({ type: "settings_ui_hints", uiHints: snapshot.settingsUiHints });
    listener({ type: "dialog_ui_state", uiState: snapshot.dialogUiState });
    listener({ type: "dialog_vrm_ui_state", uiState: snapshot.dialogVrmUiState });
    listener({ type: "startup_settings_status", status: snapshot.startupSettingsStatus });
    listener({
        type: "startup_settings_capabilities",
        capabilities: snapshot.startupSettingsCapabilities,
    });
    listener({
        type: "looking_glass_state",
        state: snapshot.lookingGlassState.state,
        code: snapshot.lookingGlassState.code,
        message: snapshot.lookingGlassState.message,
    });
    listener({ type: "looking_glass_config_status", status: snapshot.lookingGlassConfigStatus });
    listener(snapshot.connectionStateEvent);
}
