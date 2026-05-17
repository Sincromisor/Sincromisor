import type { SincroAppDialogFacade } from "./SincroAppDialogFacade";
import { emitSincroAppSettingsApplyEvents } from "./SincroAppEmitHelpers";
import type { SincroAppLookingGlassStateTracker } from "./SincroAppLookingGlassStateTracker";
import { applySincroAppSettingsPartial } from "./SincroAppSettingsApply";
import type { SincroAppSettingsRelatedPayloadCache } from "./SincroAppSettingsRelatedPayloadCache";
import type { SincroAppEvent, SincroAppSettingsSnapshot } from "./SincroAppTypes";

type SincroAppSettingsApplyFlowParams = {
    dialogManager: SincroAppDialogFacade;
    partial: Partial<SincroAppSettingsSnapshot>;
    settingsRelatedPayloadCache: SincroAppSettingsRelatedPayloadCache;
    lookingGlassTracker: SincroAppLookingGlassStateTracker;
    emitEvent: (event: SincroAppEvent) => void;
    getSettingsSnapshot: () => SincroAppSettingsSnapshot;
    setSuppressSettingsSnapshotEvent: (value: boolean) => void;
};

// settings は DialogManager と Looking Glass runtime config をまたいで更新される。
// 反映中の同期通知を抑止し、反映後に snapshot/status をまとめて UI へ流す。
export function applySincroAppControllerSettings(params: SincroAppSettingsApplyFlowParams): void {
    params.setSuppressSettingsSnapshotEvent(true);
    try {
        applySincroAppSettingsPartial(params.dialogManager, params.partial);
    } finally {
        params.setSuppressSettingsSnapshotEvent(false);
    }
    const currentSettingsSnapshot = params.getSettingsSnapshot();
    params.settingsRelatedPayloadCache.withCache(() => {
        const settingsPayload = params.settingsRelatedPayloadCache.build(currentSettingsSnapshot);
        emitSincroAppSettingsApplyEvents(params.emitEvent, {
            ...settingsPayload,
            lookingGlassConfigStatus: params.lookingGlassTracker.getConfigStatus(),
        });
    }, currentSettingsSnapshot);
}
