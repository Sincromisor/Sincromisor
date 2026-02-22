import type { PanelRtcState } from "./panelTypes";
import type { SincroAppLifecycleState } from "../../ts/App/SincroAppTypes";

// Diagnostics 表示専用の軽量フォーマッタ。UI側に重い分岐を散らさないために分離している。
export function formatMaybeNumber(value: number | null | undefined): string {
    return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "-";
}

export function formatMaybeProbability(value: number | null | undefined): string {
    return typeof value === "number" && Number.isFinite(value)
        ? `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`
        : "-";
}

export function getEffectiveConnectionState(
    lifecycleState: SincroAppLifecycleState,
    rtcState: PanelRtcState,
): string {
    // AppController 導出の connection_state 移行前に使っていた簡易判定を、互換用途として残している。
    const ice = (rtcState.iceConnectionState || "").toLowerCase();
    const signaling = (rtcState.signalingState || "").toLowerCase();

    if (ice === "connected" || ice === "completed") {
        return `connected (ice:${ice})`;
    }
    if (ice === "checking") {
        return "connecting (ice:checking)";
    }
    if (ice === "failed" || ice === "disconnected") {
        return `degraded (ice:${ice})`;
    }
    if (lifecycleState === "running" && signaling) {
        return `running / signaling:${signaling}`;
    }
    if (lifecycleState === "starting") {
        return "starting";
    }
    if (lifecycleState === "stopping") {
        return "stopping";
    }
    if (lifecycleState === "stopped") {
        return "stopped";
    }
    return lifecycleState || "idle";
}
