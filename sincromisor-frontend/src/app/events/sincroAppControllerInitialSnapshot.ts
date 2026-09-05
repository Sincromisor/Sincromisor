import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppSettingsSnapshot,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";
import type { SincroAppLookingGlassStateTracker } from "./sincroAppLookingGlassStateTracker";
import { emitSincroAppInitialSnapshot } from "./sincroAppSubscriptionSnapshot";

type SincroAppControllerInitialSnapshotParams = {
    listener: (event: SincroAppEvent) => void;
    lifecycleState: SincroAppLifecycleState;
    startupSettingsCapabilities: SincroAppStartupSettingsCapabilities;
    settings: SincroAppSettingsSnapshot;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
    getUiStateSnapshot: () => {
        dialogUiState: SincroAppDialogUiState;
        dialogVrmUiState: SincroAppDialogVrmUiState;
    };
    getLookingGlassState: () => ReturnType<SincroAppLookingGlassStateTracker["getState"]>;
    getLookingGlassConfigStatus: () => ReturnType<
        SincroAppLookingGlassStateTracker["getConfigStatus"]
    >;
    buildConnectionStateEvent: () => SincroAppEvent;
};

/** 起動・接続・ページ固有状態の初期通知を送る。設定値は専用の購読から取得する。 */
export function emitSincroAppControllerInitialSnapshot(
    params: SincroAppControllerInitialSnapshotParams,
): void {
    const uiStateSnapshot = params.getUiStateSnapshot();
    emitSincroAppInitialSnapshot(params.listener, {
        lifecycleState: params.lifecycleState,
        settings: params.settings,
        dialogUiState: uiStateSnapshot.dialogUiState,
        dialogVrmUiState: uiStateSnapshot.dialogVrmUiState,
        startupSettingsStatus: params.startupSettingsStatus,
        startupSettingsCapabilities: params.startupSettingsCapabilities,
        lookingGlassState: params.getLookingGlassState(),
        lookingGlassConfigStatus: params.getLookingGlassConfigStatus(),
        connectionStateEvent: params.buildConnectionStateEvent(),
    });
}
