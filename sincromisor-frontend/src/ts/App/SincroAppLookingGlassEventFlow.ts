import type { SincroAppEvent, SincroAppLookingGlassConfigUpdatedEventDetail, SincroAppLookingGlassEventDetail } from "./SincroAppTypes";
import type { SincroAppLookingGlassStateTracker } from "./SincroAppLookingGlassStateTracker";

type SincroAppLookingGlassEventFlowContext = {
    tracker: SincroAppLookingGlassStateTracker;
    emit: (event: SincroAppEvent) => void;
};

export type SincroAppLookingGlassStateFlowParams = SincroAppLookingGlassEventFlowContext & {
    detail: SincroAppLookingGlassEventDetail;
};

export type SincroAppLookingGlassConfigUpdatedFlowParams = SincroAppLookingGlassEventFlowContext & {
    detail: SincroAppLookingGlassConfigUpdatedEventDetail;
};

export type SincroAppLookingGlassConfigStatusFlowParams = SincroAppLookingGlassEventFlowContext;

// Looking Glass 関連 window event の処理手順を helper に分離し、
// AppController の handler 本文を短く保つ。
function applyLookingGlassStateFlow(params: SincroAppLookingGlassStateFlowParams): void {
    params.tracker.setState({
        state: params.detail.state,
        code: params.detail.code,
        message: params.detail.message,
    });

    if (params.detail.state === "active") {
        // セッション開始直後に config status を先に通知しておくと、UI が active 表示へ切り替わる前後でも
        // 「pending/reloadRecommended」の表示が古いまま残りにくい。
        params.emit({ type: "looking_glass_config_status", status: params.tracker.getConfigStatus() });
    }

    const state = params.tracker.getState();
    params.emit({
        type: "looking_glass_state",
        state: state.state,
        code: state.code,
        message: state.message,
    });
    // state 通知後にも config status を再送し、UI 側が state/config を同一イベントループ内で取りこぼしても
    // 最終表示が tracker 現在値に収束するようにしている（保守的な二重通知）。
    params.emit({ type: "looking_glass_config_status", status: params.tracker.getConfigStatus() });
}

export function handleLookingGlassStateFlow(params: SincroAppLookingGlassStateFlowParams): void {
    applyLookingGlassStateFlow(params);
}

function applyLookingGlassConfigUpdatedFlow(params: SincroAppLookingGlassConfigUpdatedFlowParams): void {
    // 現状は changedKeys のみ利用。config 本体は将来の差分比較用に event payload に残している。
    void params.detail.config;
    params.tracker.addChangedKeys(params.detail.changedKeys);
    params.emit({ type: "looking_glass_config_status", status: params.tracker.getConfigStatus() });
}

export function handleLookingGlassConfigUpdatedFlow(params: SincroAppLookingGlassConfigUpdatedFlowParams): void {
    applyLookingGlassConfigUpdatedFlow(params);
}

export function emitLookingGlassConfigStatus(
    params: SincroAppLookingGlassConfigStatusFlowParams,
): void {
    params.emit({ type: "looking_glass_config_status", status: params.tracker.getConfigStatus() });
}
