import type { SincroAppDialogFacade } from "../bridges/sincroAppDialogFacade";
import type {
    SincroAppSettingsSnapshot,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";
import { buildSincroAppSettingsSnapshot } from "./sincroAppSettingsSnapshotBuilder";

/** 設定の公開と再起動判定に必要な、適用完了時点の値。 */
export type SincroAppSettingsRelatedSnapshotPayload = {
    settings: SincroAppSettingsSnapshot;
    settingsUiState: import("../controller/sincroAppTypes").SincroAppSettingsUiState;
    settingsUiHints: import("../controller/sincroAppTypes").SincroAppSettingsUiHints;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
};

/** 設定適用後またはダイアログからの変更通知後に、値・操作可否・案内を一度に取得する。 */
export function buildSincroAppSettingsRelatedSnapshotPayload(params: {
    dialogManager: SincroAppDialogFacade;
    settings?: SincroAppSettingsSnapshot;
    buildStartupSettingsStatus: (
        currentSettings: SincroAppSettingsSnapshot,
    ) => SincroAppStartupSettingsStatus;
}): SincroAppSettingsRelatedSnapshotPayload {
    const settings = params.settings ?? buildSincroAppSettingsSnapshot(params.dialogManager);
    return {
        settings,
        settingsUiState: params.dialogManager.settingsUiState(),
        settingsUiHints: params.dialogManager.settingsUiHints(),
        startupSettingsStatus: params.buildStartupSettingsStatus(settings),
    };
}
