import type {
    SincroAppController,
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppStartupSettingsStatus,
} from "../controller";

type DialogUiSnapshotSetters = {
    setDialogUiState: (value: SincroAppDialogUiState) => void;
    setDialogVrmUiState: (value: SincroAppDialogVrmUiState) => void;
};

type StartupSnapshotSetters = {
    setStartupSettingsStatus: (value: SincroAppStartupSettingsStatus) => void;
};

/** 有効な制御処理の変更時に、ダイアログ表示とVRM選択を初期同期する。 */
export function hydrateDialogUiSnapshotsFromController(
    controller: SincroAppController,
    setters: DialogUiSnapshotSetters,
): void {
    // dialog 固有 UI 状態（open/startButton/VRM D&D）は settings とは別タイミングで使うため分離。
    setters.setDialogUiState(controller.state.getDialogUiState());
    setters.setDialogVrmUiState(controller.state.getDialogVrmUiState());
}

/** 有効な制御処理の変更時に、現在の再起動案内を同期する。 */
export function hydrateStartupSettingsStatusFromController(
    controller: SincroAppController,
    setters: StartupSnapshotSetters,
): void {
    // startup status は派生値だが UI では単独表示が多いため単独 helper を用意している。
    setters.setStartupSettingsStatus(controller.state.getStartupSettingsStatus());
}
