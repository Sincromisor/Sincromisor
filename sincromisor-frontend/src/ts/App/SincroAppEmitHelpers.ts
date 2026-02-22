import type {
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppLookingGlassConfigStatus,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsStatus,
} from "./SincroAppTypes";

// AppController からの event emit 順序を helper 化し、Controller 本体を「いつ通知するか」に集中させる。
export function emitSincroAppLifecycle(
    emit: (event: SincroAppEvent) => void,
    state: SincroAppLifecycleState,
    startupSettingsStatus: SincroAppStartupSettingsStatus,
): void {
    // lifecycle 更新と startup 設定の再起動判定は UI でセット表示するため、同じ helper で連続通知する。
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
    // settings 関連は同一タイミングの snapshot としてまとめて配信し、UI 側の整合を取りやすくする。
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
    // applySettings 後は Looking Glass の反映状況も更新されるため、settings snapshot 群に追加で通知する。
    emitSincroAppSettingsRelatedSnapshots(emit, payload);
    emit({ type: "looking_glass_config_status", status: payload.lookingGlassConfigStatus });
}

export function emitSincroAppConnectionState(
    emit: (event: SincroAppEvent) => void,
    event: SincroAppEvent,
): void {
    // 現状は pass-through だが、将来 connection_state emit の前後に監視ログ等を挟む余地を残している。
    emit(event);
}
