import type { SincroAppDialogFacade } from "../bridges/sincroAppDialogFacade";
import type {
    SincroAppEvent,
    SincroAppSettingsSnapshot,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";
import { emitSincroAppSettingsApplyEvents } from "../events/sincroAppEmitHelpers";
import type { SincroAppLookingGlassStateTracker } from "../events/sincroAppLookingGlassStateTracker";
import { applySincroAppSettingsPartial } from "./sincroAppSettingsApply";
import { buildSincroAppSettingsRelatedSnapshotPayload } from "./sincroAppSettingsRelatedSnapshotBuilder";
import type { SincroAppSettingsStore } from "./sincroAppSettingsStore";

type SincroAppSettingsApplyFlowParams = {
    dialogManager: SincroAppDialogFacade;
    partial: Partial<SincroAppSettingsSnapshot>;
    settingsStore: SincroAppSettingsStore;
    buildStartupSettingsStatus: (
        settings: SincroAppSettingsSnapshot,
    ) => SincroAppStartupSettingsStatus;
    lookingGlassTracker: SincroAppLookingGlassStateTracker;
    emitEvent: (event: SincroAppEvent) => void;
    getSettingsSnapshot: () => SincroAppSettingsSnapshot;
    setSuppressSettingsSnapshotEvent: (value: boolean) => void;
};

/** ダイアログとLooking Glassの設定を反映し、途中の通知を抑止して完了後の値を公開する。 */
export function applySincroAppControllerSettings(params: SincroAppSettingsApplyFlowParams): void {
    params.setSuppressSettingsSnapshotEvent(true);
    try {
        applySincroAppSettingsPartial(params.dialogManager, params.partial);
    } finally {
        params.setSuppressSettingsSnapshotEvent(false);
    }
    const currentSettingsSnapshot = params.getSettingsSnapshot();
    const settingsPayload = buildSincroAppSettingsRelatedSnapshotPayload({
        dialogManager: params.dialogManager,
        settings: currentSettingsSnapshot,
        buildStartupSettingsStatus: params.buildStartupSettingsStatus,
    });
    emitSincroAppSettingsApplyEvents(params.emitEvent, params.settingsStore, {
        ...settingsPayload,
        lookingGlassConfigStatus: params.lookingGlassTracker.getConfigStatus(),
    });
}
