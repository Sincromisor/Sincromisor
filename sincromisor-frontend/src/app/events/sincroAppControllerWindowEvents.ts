import type {
    SincroAppEvent,
    SincroAppLookingGlassConfigUpdatedEventDetail,
    SincroAppLookingGlassEventDetail,
} from "../controller/sincroAppTypes";
import {
    emitLookingGlassConfigStatus,
    handleLookingGlassConfigUpdatedFlow,
    handleLookingGlassStateFlow,
} from "./sincroAppLookingGlassEventFlow";
import type { SincroAppLookingGlassStateTracker } from "./sincroAppLookingGlassStateTracker";
import { bindSincroAppWindowEvents } from "./sincroAppWindowEventBinder";

type SincroAppControllerWindowEventParams = {
    lookingGlassTracker: SincroAppLookingGlassStateTracker;
    emitEvent: (event: SincroAppEvent) => void;
    openDialog: () => void;
};

/** ウィンドウ通知を状態更新へ接続し、呼び出し元が所有する購読の解除関数を返す。 */
export function bindSincroAppControllerWindowEvents(
    params: SincroAppControllerWindowEventParams,
): () => void {
    return bindSincroAppWindowEvents({
        onLookingGlassState: (event) => handleLookingGlassStateEvent(params, event),
        onLookingGlassConfigUpdated: (event) => handleLookingGlassConfigUpdated(params, event),
        onLookingGlassPolyfillReinitReady: () => handleLookingGlassPolyfillReinitReady(params),
        onOpenConfigurationDialog: params.openDialog,
    });
}

function handleLookingGlassStateEvent(
    params: SincroAppControllerWindowEventParams,
    event: CustomEvent<SincroAppLookingGlassEventDetail>,
): void {
    handleLookingGlassStateFlow({
        tracker: params.lookingGlassTracker,
        detail: event.detail,
        emit: params.emitEvent,
    });
}

function handleLookingGlassConfigUpdated(
    params: SincroAppControllerWindowEventParams,
    event: CustomEvent<SincroAppLookingGlassConfigUpdatedEventDetail>,
): void {
    handleLookingGlassConfigUpdatedFlow({
        tracker: params.lookingGlassTracker,
        detail: event.detail,
        emit: params.emitEvent,
    });
}

function handleLookingGlassPolyfillReinitReady(params: SincroAppControllerWindowEventParams): void {
    emitLookingGlassConfigStatus({
        tracker: params.lookingGlassTracker,
        emit: params.emitEvent,
    });
}
