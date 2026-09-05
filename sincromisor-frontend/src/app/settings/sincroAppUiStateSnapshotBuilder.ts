import type { SincroAppDialogFacade } from "../bridges/sincroAppDialogFacade";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
} from "../controller/sincroAppTypes";

/** 設定とは別に初期同期する、ダイアログ表示とVRM選択状態。 */
export type SincroAppUiStateSnapshot = {
    dialogUiState: SincroAppDialogUiState;
    dialogVrmUiState: SincroAppDialogVrmUiState;
};

/** 設定購読から独立したダイアログ表示状態を取得する。 */
export function buildSincroAppUiStateSnapshot(
    dialogManager: SincroAppDialogFacade,
): SincroAppUiStateSnapshot {
    return {
        dialogUiState: dialogManager.getDialogUiState(),
        dialogVrmUiState: dialogManager.getVrmUiState(),
    };
}
