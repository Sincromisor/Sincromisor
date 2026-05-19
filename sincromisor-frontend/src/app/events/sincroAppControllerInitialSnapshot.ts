import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
} from "../controller/sincroAppTypes";
import type { SincroAppSettingsRelatedPayloadCache } from "../settings/sincroAppSettingsRelatedPayloadCache";
import type { SincroAppLookingGlassStateTracker } from "./sincroAppLookingGlassStateTracker";
import { emitSincroAppInitialSnapshot } from "./sincroAppSubscriptionSnapshot";

type SincroAppControllerInitialSnapshotParams = {
    listener: (event: SincroAppEvent) => void;
    lifecycleState: SincroAppLifecycleState;
    startupSettingsCapabilities: SincroAppStartupSettingsCapabilities;
    settingsRelatedPayloadCache: SincroAppSettingsRelatedPayloadCache;
    getUiStateSnapshot: () => {
        settingsUiState: SincroAppSettingsUiState;
        settingsUiHints: SincroAppSettingsUiHints;
        dialogUiState: SincroAppDialogUiState;
        dialogVrmUiState: SincroAppDialogVrmUiState;
    };
    getLookingGlassState: () => ReturnType<SincroAppLookingGlassStateTracker["getState"]>;
    getLookingGlassConfigStatus: () => ReturnType<
        SincroAppLookingGlassStateTracker["getConfigStatus"]
    >;
    buildConnectionStateEvent: () => SincroAppEvent;
};

// 購読直後に UI が必要とする snapshot 一式を同一世代で送る。
// 初回描画向け payload 構築を AppController 本体から分離し、通常イベント処理と混ざらないようにする。
export function emitSincroAppControllerInitialSnapshot(
    params: SincroAppControllerInitialSnapshotParams,
): void {
    params.settingsRelatedPayloadCache.withCache(() => {
        const uiStateSnapshot = params.getUiStateSnapshot();
        const settingsPayload = params.settingsRelatedPayloadCache.build();
        emitSincroAppInitialSnapshot(params.listener, {
            lifecycleState: params.lifecycleState,
            settings: settingsPayload.settings,
            settingsUiState: settingsPayload.settingsUiState,
            settingsUiHints: settingsPayload.settingsUiHints,
            dialogUiState: uiStateSnapshot.dialogUiState,
            dialogVrmUiState: uiStateSnapshot.dialogVrmUiState,
            startupSettingsStatus: settingsPayload.startupSettingsStatus,
            startupSettingsCapabilities: params.startupSettingsCapabilities,
            lookingGlassState: params.getLookingGlassState(),
            lookingGlassConfigStatus: params.getLookingGlassConfigStatus(),
            connectionStateEvent: params.buildConnectionStateEvent(),
        });
    });
}
