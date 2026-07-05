/**
 * motion-debug viewer の固定 catalog。
 *
 * layer key と mode の順序は selector、snapshot JSON、既存テストの表示順に影響する。
 * ここでは label と Phase 1 reserved layer だけを持ち、各 layer の値解決や status 変換は扱わない。
 */
import type { MotionDebugLayerKey, MotionDebugViewerMode } from "./types";

/**
 * motion-debug viewer の固定 layer 順序。
 *
 * selector、snapshot JSON、tests がこの順序を前提にするため、追加・削除時は label と snapshot
 * assembly を同時に更新する。
 */
export const MOTION_DEBUG_LAYER_KEYS: MotionDebugLayerKey[] = [
    "camera",
    "mediapipe",
    "poseSnapshot",
    "reliability",
    "canonical",
    "temporal",
    "intent",
    "postProcessing",
    "solver",
    "finalPose",
    "applied",
    "metrics",
];

/**
 * viewer が持つ top-level mode。
 *
 * `metrics` は replay frame の保存済み metrics と計算済み summary を同じ UI に出すための表示 mode で、
 * tracker runtime の推論 mode ではない。
 */
export const MOTION_DEBUG_VIEWER_MODES: MotionDebugViewerMode[] = [
    "live",
    "recording",
    "replay",
    "metrics",
];

const LAYER_LABELS: Record<MotionDebugLayerKey, string> = {
    camera: "Camera",
    mediapipe: "MediaPipe raw",
    poseSnapshot: "Pose snapshot",
    reliability: "Reliability",
    canonical: "Canonical",
    temporal: "Temporal",
    intent: "Intent",
    postProcessing: "Post-processing",
    solver: "Solver",
    finalPose: "Final pose",
    applied: "Applied",
    metrics: "Metrics",
};

const RESERVED_PHASE_1_LAYERS = new Set<MotionDebugLayerKey>(["mediapipe", "canonical", "applied"]);

/**
 * layer key に対応する表示 label を返す。
 *
 * 入力は `MotionDebugLayerKey` に限定されるため失敗しない。返却値は UI 表示用であり、保存 log や
 * replay schema の識別子としては使わない。
 */
export function getMotionDebugLayerLabel(key: MotionDebugLayerKey): string {
    return LAYER_LABELS[key];
}

/**
 * Phase 1 時点で予約済みだが値が未収録の layer を判定する。
 *
 * true の場合、値欠損は `not_recorded` ではなく `not_implemented` として表示する。将来 layer を実装
 * したときは、この予約集合と snapshot assembly の両方を更新する。
 */
export function isMotionDebugPhase1ReservedLayer(key: MotionDebugLayerKey): boolean {
    return RESERVED_PHASE_1_LAYERS.has(key);
}
