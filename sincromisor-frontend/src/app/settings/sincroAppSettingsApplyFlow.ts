import type {
    SincroAppEvent,
    SincroAppSettingsSnapshot,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";
import { emitSincroAppSettingsApplyEvents } from "../events/sincroAppEmitHelpers";
import type { SincroAppLookingGlassStateTracker } from "../events/sincroAppLookingGlassStateTracker";
import { applySincroAppSettingsPartial } from "./sincroAppSettingsApply";
import type { SincroAppSettingsAccess } from "./sincroAppSettingsModel";
import { buildSincroAppSettingsRelatedSnapshotPayload } from "./sincroAppSettingsRelatedSnapshotBuilder";
import type { SincroAppSettingsStore } from "./sincroAppSettingsStore";

type SincroAppSettingsApplyFlowParams = {
    settingsModel: SincroAppSettingsAccess;
    partial: Partial<SincroAppSettingsSnapshot>;
    source?: "user" | "restore";
    settingsStore: SincroAppSettingsStore;
    buildStartupSettingsStatus: (
        settings: SincroAppSettingsSnapshot,
    ) => SincroAppStartupSettingsStatus;
    lookingGlassTracker: SincroAppLookingGlassStateTracker;
    emitEvent: (event: SincroAppEvent) => void;
    getSettingsSnapshot: () => SincroAppSettingsSnapshot;
    setSuppressSettingsSnapshotEvent: (value: boolean) => void;
};

/** 通常設定とLooking Glassの設定を反映し、途中の通知を抑止して完了後の値を公開する。 */
export function applySincroAppControllerSettings(params: SincroAppSettingsApplyFlowParams): void {
    params.setSuppressSettingsSnapshotEvent(true);
    try {
        applySincroAppSettingsPartial(params.settingsModel, params.partial, params.source);
    } finally {
        params.setSuppressSettingsSnapshotEvent(false);
    }
    const currentSettingsSnapshot = params.getSettingsSnapshot();
    const settingsPayload = buildSincroAppSettingsRelatedSnapshotPayload({
        settingsModel: params.settingsModel,
        settings: currentSettingsSnapshot,
        buildStartupSettingsStatus: params.buildStartupSettingsStatus,
    });
    emitSincroAppSettingsApplyEvents(params.emitEvent, params.settingsStore, {
        ...settingsPayload,
        lookingGlassConfigStatus: params.lookingGlassTracker.getConfigStatus(),
    });
}
