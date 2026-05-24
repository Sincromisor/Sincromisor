import type { SincroAppController, SincroAppEvent } from "../../../app/controller";
import { hydrateDialogUiSnapshotsFromController } from "../../../app/react/sincroAppStateSnapshotHydrators";
import type { ConfigurationDialogUiStateSetters } from "./configurationDialogStateGroups";

export function hydrateConfigurationDialogUiFromController(
    controller: SincroAppController,
    setters: ConfigurationDialogUiStateSetters,
): void {
    // active controller 差し替え時も subscribe 初回イベント前に最低限の snapshot を反映して空白を減らす。
    hydrateDialogUiSnapshotsFromController(controller, setters);
}

export function applyConfigurationDialogUiEvent(
    event: SincroAppEvent,
    setters: ConfigurationDialogUiStateSetters,
): void {
    switch (event.type) {
        case "dialog_vrm_ui_state":
            setters.setDialogVrmUiState(event.uiState);
            return;
        case "dialog_ui_state":
            setters.setDialogUiState(event.uiState);
            return;
        default:
            return;
    }
}
