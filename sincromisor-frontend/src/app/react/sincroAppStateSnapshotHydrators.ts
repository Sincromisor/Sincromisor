import type {
    SincroAppController,
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsStatus,
} from "../controller";

type SettingsSnapshotSetters = {
    // hook ごとの setState 実装差分を吸収するため、setter 形状だけ受け取る。
    setSettings: (
        value:
            | SincroAppSettingsSnapshot
            | ((prev: SincroAppSettingsSnapshot) => SincroAppSettingsSnapshot),
    ) => void;
    setSettingsUiState: (value: SincroAppSettingsUiState) => void;
    setSettingsUiHints: (value: SincroAppSettingsUiHints) => void;
};

type DialogUiSnapshotSetters = {
    setDialogUiState: (value: SincroAppDialogUiState) => void;
    setDialogVrmUiState: (value: SincroAppDialogVrmUiState) => void;
};

type StartupSnapshotSetters = {
    setStartupSettingsStatus: (value: SincroAppStartupSettingsStatus) => void;
};

// React hook から controller.state snapshot をまとめて反映する helper。
// active controller 差し替え時や初期化時の「空白状態」を減らす用途に使う。
export function hydrateSettingsSnapshotsFromController(
    controller: SincroAppController,
    setters: SettingsSnapshotSetters,
): void {
    setters.setSettings(controller.state.getSettingsSnapshot());
    setters.setSettingsUiState(controller.state.getSettingsUiState());
    setters.setSettingsUiHints(controller.state.getSettingsUiHints());
}

export function hydrateDialogUiSnapshotsFromController(
    controller: SincroAppController,
    setters: DialogUiSnapshotSetters,
): void {
    // dialog 固有 UI 状態（open/startButton/VRM D&D）は settings とは別タイミングで使うため分離。
    setters.setDialogUiState(controller.state.getDialogUiState());
    setters.setDialogVrmUiState(controller.state.getDialogVrmUiState());
}

export function hydrateStartupSettingsStatusFromController(
    controller: SincroAppController,
    setters: StartupSnapshotSetters,
): void {
    // startup status は派生値だが UI では単独表示が多いため単独 helper を用意している。
    setters.setStartupSettingsStatus(controller.state.getStartupSettingsStatus());
}
