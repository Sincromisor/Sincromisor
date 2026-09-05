import type {
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppLookingGlassConfigStatus,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";
import type { SincroAppSettingsStore } from "../settings/sincroAppSettingsStore";

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

/** 値・操作可否・案内を一括公開してから、再起動の要否を通知する。 */
export function emitSincroAppSettingsRelatedSnapshots(
    emit: (event: SincroAppEvent) => void,
    settingsStore: SincroAppSettingsStore,
    payload: {
        settings: SincroAppSettingsSnapshot;
        settingsUiState: SincroAppSettingsUiState;
        settingsUiHints: SincroAppSettingsUiHints;
        startupSettingsStatus: SincroAppStartupSettingsStatus;
    },
): void {
    settingsStore.update({
        settings: payload.settings,
        settingsUiState: payload.settingsUiState,
        settingsUiHints: payload.settingsUiHints,
    });
    // VRMシーンの設定反映は既存のアプリイベントを使用する。
    emit({ type: "settings_snapshot", settings: payload.settings });
    emit({ type: "startup_settings_status", status: payload.startupSettingsStatus });
}

/** 設定の適用完了後に、設定購読とLooking Glassの反映状況を更新する。 */
export function emitSincroAppSettingsApplyEvents(
    emit: (event: SincroAppEvent) => void,
    settingsStore: SincroAppSettingsStore,
    payload: {
        settings: SincroAppSettingsSnapshot;
        settingsUiState: SincroAppSettingsUiState;
        settingsUiHints: SincroAppSettingsUiHints;
        startupSettingsStatus: SincroAppStartupSettingsStatus;
        lookingGlassConfigStatus: SincroAppLookingGlassConfigStatus;
    },
): void {
    // applySettings 後は Looking Glass の反映状況も更新されるため、settings snapshot 群に追加で通知する。
    emitSincroAppSettingsRelatedSnapshots(emit, settingsStore, payload);
    emit({ type: "looking_glass_config_status", status: payload.lookingGlassConfigStatus });
}

export function emitSincroAppConnectionState(
    emit: (event: SincroAppEvent) => void,
    event: SincroAppEvent,
): void {
    // 現状は pass-through だが、将来 connection_state emit の前後に監視ログ等を挟む余地を残している。
    emit(event);
}
