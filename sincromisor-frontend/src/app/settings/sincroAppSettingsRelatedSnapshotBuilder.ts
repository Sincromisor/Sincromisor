import type {
    SincroAppSettingsSnapshot,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";
import type { SincroAppSettingsAccess } from "./sincroAppSettingsModel";
import { buildSincroAppSettingsSnapshot } from "./sincroAppSettingsSnapshotBuilder";

/** 設定の公開と再起動判定に必要な、適用完了時点の値。 */
export type SincroAppSettingsRelatedSnapshotPayload = {
    settings: SincroAppSettingsSnapshot;
    settingsUiState: import("../controller/sincroAppTypes").SincroAppSettingsUiState;
    settingsUiHints: import("../controller/sincroAppTypes").SincroAppSettingsUiHints;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
};

/** 設定適用後または設定モデルからの変更通知後に、値・操作可否・案内を一度に取得する。 */
export function buildSincroAppSettingsRelatedSnapshotPayload(params: {
    settingsModel: SincroAppSettingsAccess;
    settings?: SincroAppSettingsSnapshot;
    buildStartupSettingsStatus: (
        currentSettings: SincroAppSettingsSnapshot,
    ) => SincroAppStartupSettingsStatus;
}): SincroAppSettingsRelatedSnapshotPayload {
    const settings = params.settings ?? buildSincroAppSettingsSnapshot(params.settingsModel);
    return {
        settings,
        settingsUiState: params.settingsModel.settingsUiState(),
        settingsUiHints: params.settingsModel.settingsUiHints(),
        startupSettingsStatus: params.buildStartupSettingsStatus(settings),
    };
}
