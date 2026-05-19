import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../../app/controller/sincroAppTypes";
import type { SincroAppDialogFacade } from "./sincroAppDialogFacade";

export type SincroAppUiStateSnapshot = {
    settingsUiState: SincroAppSettingsUiState;
    settingsUiHints: SincroAppSettingsUiHints;
    dialogUiState: SincroAppDialogUiState;
    dialogVrmUiState: SincroAppDialogVrmUiState;
};

// DialogManager 由来の UI 状態群をまとめて取得する helper。
// AppController 側の getter 羅列と初期購読スナップショット構築の重複を減らす。
export function buildSincroAppUiStateSnapshot(
    dialogManager: SincroAppDialogFacade,
): SincroAppUiStateSnapshot {
    return {
        settingsUiState: dialogManager.settingsUiState(),
        settingsUiHints: dialogManager.settingsUiHints(),
        dialogUiState: dialogManager.getDialogUiState(),
        dialogVrmUiState: dialogManager.getVrmUiState(),
    };
}
