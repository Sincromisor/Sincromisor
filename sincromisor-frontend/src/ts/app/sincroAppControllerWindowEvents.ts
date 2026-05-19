import type {
    SincroAppEvent,
    SincroAppLookingGlassConfigUpdatedEventDetail,
    SincroAppLookingGlassEventDetail,
} from "../../app/controller/sincroAppTypes";
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

// window custom event を AppController の内部状態更新へ接続する。
// global event 名と Looking Glass tracker の扱いを Controller 本体から分離している。
export function bindSincroAppControllerWindowEvents(
    params: SincroAppControllerWindowEventParams,
): void {
    bindSincroAppWindowEvents({
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
