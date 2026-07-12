import type { GestureIntentObservation } from "../../../character/motionIntent/motionIntentEstimator";

export type SincroGestureSource = "gesture-recognizer" | "lost";

export type SincroGestureHandedness = "left" | "right" | "unknown";

export type SincroGestureWarningCode =
    | "categories_missing"
    | "handedness_mismatch"
    | "model_not_loaded"
    | "no_hand_detected"
    | "inference_failed"
    | "gesture_skipped";

/**
 * Gesture Recognizer の片手分結果を保存可能な説明 snapshot へ正規化した contract。
 *
 * `label` は MediaPipe raw label を説明用に保持するだけで、MotionIntent の enum 代替値にはしない。
 * `confidence` は `0..1` に clamp 済みで、MediaPipe category list、landmark、crop、runtime object は
 * この境界へ入れない。左右 assignment は Hand tracker の side を正本にし、Gesture handedness は
 * mismatch warning の材料に限定する。
 */
export type SincroGestureSideSnapshot = {
    label: string;
    confidence: number;
    handedness?: SincroGestureHandedness;
    source: SincroGestureSource;
    warnings: SincroGestureWarningCode[];
};

/**
 * Gesture optional pass が runtime / observe-only pipeline へ渡す保存可能 snapshot。
 *
 * top-level は tracking availability と推論 cost だけを持ち、左右の side snapshot も plain object に固定する。
 * Gesture Recognizer の raw result、ImageBitmap、VideoFrame、MediaPipe instance は含めない。初期化失敗、
 * GPU unavailable、推論例外、Pose/Hand 依存の skip は例外ではなく `source: "lost"` と warning で表す。
 */
export type SincroGestureMotionSnapshot = {
    trackingEnabled: boolean;
    source: SincroGestureSource;
    left?: SincroGestureSideSnapshot;
    right?: SincroGestureSideSnapshot;
    warnings: SincroGestureWarningCode[];
    inferenceTimeMs: number;
    inferenceFps: number;
    lastUpdatedAtMs?: number;
    fallbackReason?: string;
};

export const DEFAULT_SINCRO_GESTURE_MOTION_SNAPSHOT: SincroGestureMotionSnapshot = {
    trackingEnabled: false,
    source: "lost",
    warnings: ["gesture_skipped"],
    inferenceTimeMs: 0,
    inferenceFps: 0,
};

export function createLostGestureSideSnapshot(
    warnings: SincroGestureWarningCode[] = ["categories_missing"],
): SincroGestureSideSnapshot {
    return {
        label: "",
        confidence: 0,
        handedness: "unknown",
        source: "lost",
        warnings: uniqueGestureWarnings(warnings),
    };
}

/**
 * Gesture optional pass の失敗・skip を lost snapshot として表す。
 *
 * caller はこの値を publish しても Face / Pose / Hand runtime を停止しない。`trackingEnabled` は
 * optional pass の要求状態を表し、依存不足や stop 時だけ明示的に `false` を渡す。
 */
export function createSincroGestureFallbackSnapshot(input: {
    reason?: string;
    nowMs?: number;
    trackingEnabled?: boolean;
    warnings?: SincroGestureWarningCode[];
}): SincroGestureMotionSnapshot {
    const warnings = uniqueGestureWarnings(["gesture_skipped", ...(input.warnings ?? [])]);
    return {
        ...DEFAULT_SINCRO_GESTURE_MOTION_SNAPSHOT,
        trackingEnabled: input.trackingEnabled ?? true,
        source: "lost",
        left: createLostGestureSideSnapshot(warnings),
        right: createLostGestureSideSnapshot(warnings),
        warnings,
        lastUpdatedAtMs: input.nowMs,
        fallbackReason: input.reason,
    };
}

/**
 * Gesture snapshot から MotionIntentEstimator 用の低次元 observation だけを取り出す。
 *
 * `source: "lost"` の side は渡さず、raw label は `sourceGestureLabel` 用の説明入力として保持する。
 * semantic intent への昇格可否は MotionIntentEstimator 側の allow list が判定する。
 */
export function toGestureIntentObservation(
    snapshot: SincroGestureMotionSnapshot,
): GestureIntentObservation | undefined {
    const left =
        snapshot.left?.source === "gesture-recognizer"
            ? { label: snapshot.left.label, confidence: snapshot.left.confidence }
            : undefined;
    const right =
        snapshot.right?.source === "gesture-recognizer"
            ? { label: snapshot.right.label, confidence: snapshot.right.confidence }
            : undefined;
    if (left === undefined && right === undefined) {
        return undefined;
    }
    return { left, right };
}

export function cloneSincroGestureMotionSnapshot(
    snapshot: SincroGestureMotionSnapshot,
): SincroGestureMotionSnapshot {
    return {
        ...snapshot,
        left: cloneSincroGestureSideSnapshot(snapshot.left),
        right: cloneSincroGestureSideSnapshot(snapshot.right),
        warnings: [...snapshot.warnings],
    };
}

export function cloneSincroGestureSideSnapshot(
    snapshot: SincroGestureSideSnapshot | undefined,
): SincroGestureSideSnapshot | undefined {
    if (snapshot === undefined) {
        return undefined;
    }
    return {
        ...snapshot,
        warnings: [...snapshot.warnings],
    };
}

export function uniqueGestureWarnings(
    warnings: readonly SincroGestureWarningCode[],
): SincroGestureWarningCode[] {
    return warnings.filter((warning, index) => warnings.indexOf(warning) === index);
}
