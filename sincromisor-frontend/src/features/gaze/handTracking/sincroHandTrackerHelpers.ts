// reason: structure-threshold-exception 左右割当は分離済み。推論・正規化・特徴量の整理は task-260914172953-split-hand-normalization で扱う。
/** 推論結果の座標復元と特徴量を作る。左右の対応付けはsincroHandAssignmentが担当する。 */

import type { Category, HandLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { mapCropPointToFullFrame } from "../trackingRuntime/roiTracking/roiCoordinateMapping";
import type {
    SincroRoiObservation,
    SincroRoiPoint,
    SincroRoiRect,
} from "../trackingRuntime/roiTracking/roiTrackingTypes";
import { handWarningsFromRoi, type SincroHandObservation } from "./sincroHandAssignmentSnapshot";
import {
    type SincroHandFeatureSnapshot,
    type SincroHandPoint2,
    type SincroHandTuple3,
    type SincroHandWarningCode,
    uniqueHandWarnings,
} from "./sincroHandMotionSnapshot";

/** 手推論の実行と解放に必要なMediaPipeの窓口。モデルの生成・破棄は追跡制御が所有する。 */
export type SincroHandLandmarkerLike = {
    detectForVideo(videoFrame: TexImageSource, timestampMs: number): HandLandmarkerResult;
    close(): void;
};

/** 未加工の推論結果と性能計測値。所要時間・終了時刻はperformance.now基準のミリ秒。 */
export type SincroHandLandmarkerInference = {
    result: HandLandmarkerResult;
    inferenceTimeMs: number;
    inferenceEndedAtMs: number;
};

type FullFrameHandLandmark = {
    x: number;
    y: number;
    z: number;
};

const HAND_LANDMARK = {
    wrist: 0,
    thumbCmc: 1,
    thumbMcp: 2,
    thumbIp: 3,
    thumbTip: 4,
    indexMcp: 5,
    indexPip: 6,
    indexDip: 7,
    indexTip: 8,
    middleMcp: 9,
    middlePip: 10,
    middleDip: 11,
    middleTip: 12,
    ringMcp: 13,
    ringPip: 14,
    ringDip: 15,
    ringTip: 16,
    littleMcp: 17,
    littlePip: 18,
    littleDip: 19,
    littleTip: 20,
};

/** 指定した動画時刻で推論し、実時間の計測値を添える。モデル未読込と推論失敗は呼び出し元へ伝播する。 */
export function runSincroHandLandmarker(input: {
    handLandmarker: SincroHandLandmarkerLike | undefined;
    videoFrame: TexImageSource;
    timestampMs: number;
}): SincroHandLandmarkerInference {
    const inferenceStartedAtMs = performance.now();
    const result = input.handLandmarker?.detectForVideo(input.videoFrame, input.timestampMs);
    const inferenceEndedAtMs = performance.now();
    if (result === undefined) {
        throw new Error("HandLandmarker model is not loaded.");
    }
    return {
        result,
        inferenceTimeMs: inferenceEndedAtMs - inferenceStartedAtMs,
        inferenceEndedAtMs,
    };
}

/** 推論終了時刻の差から頻度を算出する。初回は0、同時刻は1ミリ秒として扱う。 */
export function calculateHandInferenceFps(input: {
    lastInferenceEndedAtMs: number | undefined;
    inferenceEndedAtMs: number;
}): number {
    return input.lastInferenceEndedAtMs === undefined
        ? 0
        : 1000 / Math.max(1, input.inferenceEndedAtMs - input.lastInferenceEndedAtMs);
}

/** Pose手首由来で信頼度と面積を持つROIだけを切り抜き推論に使う。 */
export function handRoiIsUsable(roi: SincroRoiObservation): boolean {
    return (
        roi.source === "pose-wrist" &&
        roi.confidence > 0 &&
        roi.rect.width > 0 &&
        roi.rect.height > 0
    );
}

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

/** 復元済みランドマークから手のひら方向と指の低次元特徴を作る。手の開閉は信頼度と欠損を考慮する。 */
export function createSincroHandFeatureSnapshot(input: {
    landmarks: readonly FullFrameHandLandmark[];
    confidence: number;
    landmarksMissing: boolean;
}): SincroHandFeatureSnapshot {
    const palmSize = Math.max(
        distance3d(input.landmarks[HAND_LANDMARK.wrist], input.landmarks[HAND_LANDMARK.middleMcp]),
        0.001,
    );
    const fingerCurl = {
        thumb: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.thumbMcp,
            HAND_LANDMARK.thumbTip,
            palmSize,
        ),
        index: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.indexMcp,
            HAND_LANDMARK.indexTip,
            palmSize,
        ),
        middle: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.middleMcp,
            HAND_LANDMARK.middleTip,
            palmSize,
        ),
        ring: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.ringMcp,
            HAND_LANDMARK.ringTip,
            palmSize,
        ),
        little: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.littleMcp,
            HAND_LANDMARK.littleTip,
            palmSize,
        ),
    };
    return {
        palmNormal: palmNormal(input.landmarks),
        palmDirection: palmDirection(input.landmarks),
        fingerCurl,
        fingerSplay: {
            indexMiddle: fingerSplay(
                input.landmarks,
                HAND_LANDMARK.indexMcp,
                HAND_LANDMARK.middleMcp,
            ),
            middleRing: fingerSplay(
                input.landmarks,
                HAND_LANDMARK.middleMcp,
                HAND_LANDMARK.ringMcp,
            ),
            ringLittle: fingerSplay(
                input.landmarks,
                HAND_LANDMARK.ringMcp,
                HAND_LANDMARK.littleMcp,
            ),
        },
        thumbOppose: thumbOppose(input.landmarks, palmSize),
        openness: determineSincroHandOpenness({
            fingerCurl,
            confidence: input.confidence,
            landmarksMissing: input.landmarksMissing,
        }),
    };
}

/** 信頼度0.2未満・欠損は不明とし、親指以外の平均曲げ量0.35・0.72を境に開閉を判定する。 */
export function determineSincroHandOpenness(input: {
    fingerCurl: Pick<SincroHandFeatureSnapshot, "fingerCurl">["fingerCurl"];
    confidence: number;
    landmarksMissing?: boolean;
}): SincroHandFeatureSnapshot["openness"] {
    if (input.landmarksMissing || input.confidence < 0.2) {
        return "unknown";
    }
    const averageCurl =
        (input.fingerCurl.index +
            input.fingerCurl.middle +
            input.fingerCurl.ring +
            input.fingerCurl.little) /
        4;
    if (averageCurl <= 0.35) {
        return "open";
    }
    if (averageCurl < 0.72) {
        return "half";
    }
    return "closed";
}

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

function confidenceWarnings(rawScore: number, confidence: number): SincroHandWarningCode[] {
    return !Number.isFinite(rawScore) || confidence < 0.2 ? ["low_confidence"] : [];
}

function mapHandPointToFullFrame(
    roi: SincroRoiRect | undefined,
    point: SincroRoiPoint,
): SincroRoiPoint {
    return roi === undefined ? point : mapCropPointToFullFrame(roi, point);
}

function palmDirection(landmarks: readonly FullFrameHandLandmark[]): SincroHandTuple3 {
    return normalizeTuple3(
        vector3(landmarks[HAND_LANDMARK.wrist], landmarks[HAND_LANDMARK.middleMcp]),
        [0, -1, 0],
    );
}

function palmNormal(landmarks: readonly FullFrameHandLandmark[]): SincroHandTuple3 {
    const wrist = landmarks[HAND_LANDMARK.wrist];
    const index = landmarks[HAND_LANDMARK.indexMcp];
    const little = landmarks[HAND_LANDMARK.littleMcp];
    const indexVector = vector3(wrist, index);
    const littleVector = vector3(wrist, little);
    return normalizeTuple3(cross(indexVector, littleVector), [0, 0, 1]);
}

function calculateFingerCurl(
    landmarks: readonly FullFrameHandLandmark[],
    mcpIndex: number,
    tipIndex: number,
    palmSize: number,
): number {
    return clamp01(1 - distance3d(landmarks[mcpIndex], landmarks[tipIndex]) / (palmSize * 1.6));
}

function fingerSplay(
    landmarks: readonly FullFrameHandLandmark[],
    firstMcpIndex: number,
    secondMcpIndex: number,
): number {
    const wrist = landmarks[HAND_LANDMARK.wrist];
    const first = normalizeTuple3(vector3(wrist, landmarks[firstMcpIndex]), [0, 0, 0]);
    const second = normalizeTuple3(vector3(wrist, landmarks[secondMcpIndex]), [0, 0, 0]);
    const dot = clamp(dot3(first, second), -1, 1);
    return clamp01(Math.acos(dot) / (Math.PI / 3));
}

function thumbOppose(landmarks: readonly FullFrameHandLandmark[], palmSize: number): number {
    const thumbTip = landmarks[HAND_LANDMARK.thumbTip];
    const littleMcp = landmarks[HAND_LANDMARK.littleMcp];
    return clamp01(1 - distance3d(thumbTip, littleMcp) / (palmSize * 2));
}

function landmarkPoint2(landmark: FullFrameHandLandmark | undefined): SincroHandPoint2 {
    if (landmark === undefined) {
        return [0, 0];
    }
    return [clamp01(landmark.x), clamp01(landmark.y)];
}

function vector3(
    from: FullFrameHandLandmark | undefined,
    to: FullFrameHandLandmark | undefined,
): SincroHandTuple3 {
    if (from === undefined || to === undefined) {
        return [0, 0, 0];
    }
    return [finiteOrZero(to.x - from.x), finiteOrZero(to.y - from.y), finiteOrZero(to.z - from.z)];
}

function cross(left: SincroHandTuple3, right: SincroHandTuple3): SincroHandTuple3 {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ];
}

function normalizeTuple3(value: SincroHandTuple3, fallback: SincroHandTuple3): SincroHandTuple3 {
    const length = Math.hypot(value[0], value[1], value[2]);
    if (!Number.isFinite(length) || length <= 0) {
        return fallback;
    }
    return [value[0] / length, value[1] / length, value[2] / length];
}

function distance3d(
    left: FullFrameHandLandmark | undefined,
    right: FullFrameHandLandmark | undefined,
): number {
    if (left === undefined || right === undefined) {
        return 0;
    }
    return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function dot3(left: SincroHandTuple3, right: SincroHandTuple3): number {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function clamp01(value: number): number {
    return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function finiteOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

function addHandWarning(warnings: SincroHandWarningCode[], warning: SincroHandWarningCode): void {
    if (!warnings.includes(warning)) {
        warnings.push(warning);
    }
}
