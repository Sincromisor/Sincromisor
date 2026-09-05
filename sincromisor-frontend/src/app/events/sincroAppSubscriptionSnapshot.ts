import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppLookingGlassConfigStatus,
    SincroAppLookingGlassEventDetail,
    SincroAppSettingsSnapshot,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";

/** 初期イベントとして配信する状態。Reactの設定値・操作可否・案内は設定ストアが保持し、設定イベントはシーンが使う。 */
export type SincroAppInitialSnapshot = {
    lifecycleState: SincroAppLifecycleState;
    settings: SincroAppSettingsSnapshot;
    dialogUiState: SincroAppDialogUiState;
    dialogVrmUiState: SincroAppDialogVrmUiState;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
    startupSettingsCapabilities: SincroAppStartupSettingsCapabilities;
    lookingGlassState: SincroAppLookingGlassEventDetail;
    lookingGlassConfigStatus: SincroAppLookingGlassConfigStatus;
    connectionStateEvent: SincroAppEvent;
};

/** 起動・接続・ダイアログ状態を購読直後に通知し、設定専用購読とは分離する。 */
export function emitSincroAppInitialSnapshot(
    listener: (event: SincroAppEvent) => void,
    snapshot: SincroAppInitialSnapshot,
): void {
    listener({ type: "lifecycle", state: snapshot.lifecycleState });
    listener({ type: "settings_snapshot", settings: snapshot.settings });
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
