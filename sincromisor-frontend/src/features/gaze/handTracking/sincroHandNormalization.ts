/** MediaPipeの手結果を全画面座標と通常データへ正規化し、特徴量計算を経て左右割当前の観測を返す。 */
import type { Category, HandLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { mapCropPointToFullFrame } from "../trackingRuntime/roiTracking/roiCoordinateMapping";
import type {
    SincroRoiObservation,
    SincroRoiPoint,
    SincroRoiRect,
} from "../trackingRuntime/roiTracking/roiTrackingTypes";
import { handWarningsFromRoi, type SincroHandObservation } from "./sincroHandAssignmentSnapshot";
import {
    createSincroHandFeatureSnapshot,
    type FullFrameHandLandmark,
    HAND_LANDMARK,
} from "./sincroHandFeatures";
import {
    type SincroHandPoint2,
    type SincroHandWarningCode,
    uniqueHandWarnings,
} from "./sincroHandMotionSnapshot";

/** 切り抜き内の座標を全画面へ復元する。点数不足は拒否し、非有限値はゼロと欠損警告へ置き換える。 */
export function restoreHandLandmarksToFullFrame(input: {
    landmarks: readonly NormalizedLandmark[];
    roi?: SincroRoiRect;
}): { landmarks: FullFrameHandLandmark[]; warnings: SincroHandWarningCode[] } | undefined {
    if (input.landmarks.length <= HAND_LANDMARK.littleTip) {
        return undefined;
    }
    const warnings: SincroHandWarningCode[] = [];
    const restored: FullFrameHandLandmark[] = [];
    for (const landmark of input.landmarks) {
        if (!Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) {
            addHandWarning(warnings, "landmarks_missing");
            restored.push({ x: 0, y: 0, z: 0 });
            continue;
        }
        const point = mapHandPointToFullFrame(input.roi, [landmark.x, landmark.y]);
        restored.push({
            x: point[0],
            y: point[1],
            z: Number.isFinite(landmark.z) ? landmark.z : 0,
        });
        if (!Number.isFinite(landmark.z)) {
            addHandWarning(warnings, "landmarks_missing");
        }
    }
    return { landmarks: restored, warnings };
}

/** ROI座標を全画面へ戻して観測値を作る。左右はまだ割り当てず、後段でPose手首と照合する。 */
export function normalizeSincroHandLandmarkerResult(input: {
    result: HandLandmarkerResult;
    roi?: SincroRoiObservation;
}): SincroHandObservation[] {
    const observations: SincroHandObservation[] = [];
    for (let handIndex = 0; handIndex < input.result.landmarks.length; handIndex += 1) {
        const landmarks = input.result.landmarks[handIndex];
        if (landmarks === undefined) {
            continue;
        }
        const restored = restoreHandLandmarksToFullFrame({
            landmarks,
            roi: input.roi?.rect,
        });
        if (restored === undefined) {
            continue;
        }
        const handedness = readHandedness(input.result.handedness[handIndex]);
        const confidence = clamp01(handedness.score);
        const warnings = uniqueHandWarnings([
            ...restored.warnings,
            ...handWarningsFromRoi(input.roi),
            ...confidenceWarnings(handedness.score, confidence),
        ]);
        observations.push({
            handIndex,
            wrist: landmarkPoint2(restored.landmarks[HAND_LANDMARK.wrist]),
            confidence,
            handednessLabel: handedness.label,
            handednessScore: confidence,
            features: createSincroHandFeatureSnapshot({
                landmarks: restored.landmarks,
                confidence,
                landmarksMissing: warnings.includes("landmarks_missing"),
            }),
            warnings,
        });
    }
    return observations;
}

// 最上位の左右候補だけを観測の参考値にする。ラベル欠損とスコア欠損は別に扱う。
function readHandedness(categories: Category[] | undefined): {
    label?: string;
    score: number;
} {
    const category = categories?.[0];
    return {
        label: category?.categoryName || undefined,
        score: category?.score ?? 0,
    };
}

// 信頼度は0.2未満または非有限なら低信頼の警告を残す。
function confidenceWarnings(rawScore: number, confidence: number): SincroHandWarningCode[] {
    return !Number.isFinite(rawScore) || confidence < 0.2 ? ["low_confidence"] : [];
}

function mapHandPointToFullFrame(
    roi: SincroRoiRect | undefined,
    point: SincroRoiPoint,
): SincroRoiPoint {
    return roi === undefined ? point : mapCropPointToFullFrame(roi, point);
}

function landmarkPoint2(landmark: FullFrameHandLandmark | undefined): SincroHandPoint2 {
    if (landmark === undefined) {
        return [0, 0];
    }
    return [clamp01(landmark.x), clamp01(landmark.y)];
}

function clamp01(value: number): number {
    return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function addHandWarning(warnings: SincroHandWarningCode[], warning: SincroHandWarningCode): void {
    if (!warnings.includes(warning)) {
        warnings.push(warning);
    }
}
