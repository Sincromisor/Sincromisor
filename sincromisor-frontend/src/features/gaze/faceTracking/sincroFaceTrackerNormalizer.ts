import type { Category, FaceLandmarkerResult, Matrix } from "@mediapipe/tasks-vision";
import type { SincroRoiObservation } from "../trackingRuntime/roiTracking/roiTrackingTypes";
import {
    cloneSincroRoiObservation,
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
    type SincroFaceMotionSource,
} from "./sincroFaceMotionSnapshot";

export function normalizeSincroFaceLandmarkerResult(input: {
    result: FaceLandmarkerResult;
    inferenceTimeMs: number;
    inferenceFps: number;
    nowMs: number;
    source: SincroFaceMotionSource;
    roi?: SincroRoiObservation;
    warnings: string[];
}): SincroFaceMotionSnapshot {
    const detected = input.result.faceLandmarks.length > 0;
    if (!detected) {
        return {
            ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
            headPose: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.headPose },
            blendshapes: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.blendshapes },
            trackingEnabled: true,
            source: "lost",
            roi: cloneSincroRoiObservation(input.roi),
            warnings: [...input.warnings],
            inferenceTimeMs: input.inferenceTimeMs,
            inferenceFps: input.inferenceFps,
            lastUpdatedAtMs: input.nowMs,
            fallbackReason: "face_not_detected",
        };
    }

    const blendshapes = normalizeBlendshapes(input.result.faceBlendshapes[0]?.categories ?? []);
    const matrix = input.result.facialTransformationMatrixes[0];
    return {
        trackingEnabled: true,
        detected,
        confidence: estimateConfidence(blendshapes),
        headPose: normalizeHeadPose(matrix),
        blendshapes,
        source: input.source,
        roi: cloneSincroRoiObservation(input.roi),
        warnings: [...input.warnings],
        inferenceTimeMs: input.inferenceTimeMs,
        inferenceFps: input.inferenceFps,
        lastUpdatedAtMs: input.nowMs,
    };
}

export function createSincroFaceFallbackSnapshot(
    reason: string,
    nowMs: number,
): SincroFaceMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        headPose: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.headPose },
        blendshapes: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.blendshapes },
        trackingEnabled: true,
        source: "lost",
        warnings: [],
        fallbackReason: reason,
        lastUpdatedAtMs: nowMs,
    };
}

function normalizeBlendshapes(categories: Category[]): Record<string, number> {
    const values: Record<string, number> = {};
    for (const category of categories) {
        if (!category.categoryName) {
            continue;
        }
        values[category.categoryName] = clamp01(category.score);
    }
    return values;
}

function normalizeHeadPose(matrix: Matrix | undefined) {
    const values = matrix?.data?.length === 16 ? matrix.data : undefined;
    if (values === undefined) {
        return {
            yawDeg: 0,
            pitchDeg: 0,
            rollDeg: 0,
        };
    }

    // MediaPipe の facial transformation matrix から回転成分だけを取り出す。
    // 初期 retarget では符号補正を上位で調整しやすいよう、度数法の素直な Euler 角で保持する。
    const r00 = values[0];
    const r10 = values[4];
    const r11 = values[5];
    const r12 = values[6];
    const r20 = values[8];
    const r21 = values[9];
    const r22 = values[10];
    const sy = Math.sqrt(r00 * r00 + r10 * r10);
    const singular = sy < 1e-6;
    const pitchRad = singular ? Math.atan2(-r12, r11) : Math.atan2(r21, r22);
    const yawRad = Math.atan2(-r20, sy);
    const rollRad = singular ? 0 : Math.atan2(r10, r00);
    return {
        yawDeg: radToDeg(yawRad),
        pitchDeg: radToDeg(pitchRad),
        rollDeg: radToDeg(rollRad),
        matrix: [...values],
    };
}

function estimateConfidence(blendshapes: Record<string, number>): number {
    const scores = Object.values(blendshapes);
    if (scores.length === 0) {
        return 1;
    }
    return clamp01(Math.max(...scores));
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function radToDeg(value: number): number {
    return value * (180 / Math.PI);
}
