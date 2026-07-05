/**
 * motion-debug viewer の metrics layer 表示値を作る。
 *
 * 計算済み summary と replay frame に保存された raw metrics JSON を同じ layer に表示するが、保存済み
 * frame を書き換えず viewer 表示値だけに active profile を補う。
 */
import { getMotionDebugLayerLabel } from "./motionDebugViewerCatalog";
import { hasRecordedValue } from "./motionDebugViewerLayerSnapshots";
import type { MotionDebugViewerContext } from "./motionDebugViewerModel";
import type { MotionDebugLayerSnapshot } from "./types";

/**
 * metrics layer の status と表示値を作る。
 *
 * calculated summary が無くても replay frame に保存済み metrics JSON があれば `available` にする。
 * どちらも無い場合は、未記録ではなく未計算を示す `not_calculated` を返す。
 */
export function createMetricsLayerSnapshot(
    context: MotionDebugViewerContext,
): MotionDebugLayerSnapshot {
    const metrics = context.metrics;
    if (metrics === undefined || !hasRecordedValue(metrics.metrics)) {
        if (hasRecordedValue(context.replayFrame?.metrics)) {
            return {
                status: "available",
                label: getMotionDebugLayerLabel("metrics"),
                value: createReplayMetricsLayerValue(context),
            };
        }
        return {
            status: "not_calculated",
            label: getMotionDebugLayerLabel("metrics"),
        };
    }
    return {
        status: "available",
        label: getMotionDebugLayerLabel("metrics"),
        value: metrics,
    };
}

function createReplayMetricsLayerValue(context: MotionDebugViewerContext): unknown {
    if (!isRecord(context.replayFrame?.metrics)) {
        return context.replayFrame?.metrics;
    }
    return {
        ...context.replayFrame.metrics,
        activePerformanceProfile: context.liveSnapshot.camera.performanceProfile,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
