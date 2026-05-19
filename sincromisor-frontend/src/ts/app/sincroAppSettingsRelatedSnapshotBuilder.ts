import type { SincroAppDialogFacade } from "./sincroAppDialogFacade";
import { buildSincroAppSettingsSnapshot } from "./sincroAppSettingsSnapshotBuilder";
import type { SincroAppSettingsSnapshot, SincroAppStartupSettingsStatus } from "./sincroAppTypes";
import { buildSincroAppUiStateSnapshot } from "./sincroAppUiStateSnapshotBuilder";

export type SincroAppSettingsRelatedSnapshotPayload = {
    settings: SincroAppSettingsSnapshot;
    settingsUiState: import("./sincroAppTypes").SincroAppSettingsUiState;
    settingsUiHints: import("./sincroAppTypes").SincroAppSettingsUiHints;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
};

// AppController の settings 関連イベント群で共有する snapshot payload を合成する helper。
// applySettings 後通知 / dialog 手動変更通知の双方で再利用する。
export function buildSincroAppSettingsRelatedSnapshotPayload(params: {
    dialogManager: SincroAppDialogFacade;
    settings?: SincroAppSettingsSnapshot;
    buildStartupSettingsStatus: (
        currentSettings: SincroAppSettingsSnapshot,
    ) => SincroAppStartupSettingsStatus;
}): SincroAppSettingsRelatedSnapshotPayload {
    const uiStateSnapshot = buildSincroAppUiStateSnapshot(params.dialogManager);
    const settings = params.settings ?? buildSincroAppSettingsSnapshot(params.dialogManager);
    return {
        settings,
        settingsUiState: uiStateSnapshot.settingsUiState,
        settingsUiHints: uiStateSnapshot.settingsUiHints,
        startupSettingsStatus: params.buildStartupSettingsStatus(settings),
    };
}
