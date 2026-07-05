import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import { clampConfidence, pushWarning } from "./canonicalArmFeatureMath";
import type { CanonicalUpperBodyState, CanonicalWarningCode } from "./canonicalUpperBodyState";

/**
 * canonical head 抽出専用の入力境界。
 *
 * Face snapshot は保存済み低次元値だけを受け取り、MediaPipe raw result や matrix 以外の landmark fallback は
 * 読まない。`previous` は caller contract 互換用で、extractor は fallback 値として使わない。
 */
export type CanonicalHeadFeatureInput = {
    face?: Pick<
        SincroFaceMotionSnapshot,
        "detected" | "confidence" | "headPose" | "source" | "warnings"
    >;
    reliability?: ReliabilityMap;
    previous?: CanonicalUpperBodyState["head"];
};

type HeadPoseRadians = {
    yawRad: number;
    pitchRad: number;
    rollRad: number;
};

const MATRIX_MISSING_CONFIDENCE_MAX = 0.65;
const MATRIX_INVALID_CONFIDENCE_MAX = 0.5;
const MIN_HEAD_RELIABILITY_WEIGHT = 0.05;
const LOW_CONFIDENCE_THRESHOLD = 0.15;

/**
 * FaceLandmarker の head pose snapshot から canonical head slot を生成する。
 *
 * `headPose.matrix` が 16 要素の finite number 配列である frame だけを通常観測として扱う。
 * matrix 欠損または破損時は Face tracker が持つ Euler 値へ低 confidence で fallback するが、
 * Face lost / confidence 0 / reliability lost では neutral head を作らず `undefined` を返す。
 * `previous` は入力 contract に残すが、dropout や predicted head は TemporalStateEstimator の責務であるため
 * fallback 値としては使わない。
 */
export function extractCanonicalHeadState(
    input: CanonicalHeadFeatureInput,
): CanonicalUpperBodyState["head"] | undefined {
    const face = input.face;
    if (
        face === undefined ||
        !face.detected ||
        face.source === "lost" ||
        clampConfidence(face.confidence) === 0
    ) {
        return undefined;
    }

    const extraction = extractHeadPoseRadians(face);
    if (extraction === undefined) {
        return undefined;
    }

    const reliability = resolveHeadReliability(input.reliability);
    if (
        reliability !== undefined &&
        (reliability.part.state === "lost" ||
            reliability.joint.state === "lost" ||
            reliability.partWeight < MIN_HEAD_RELIABILITY_WEIGHT ||
            reliability.jointWeight < MIN_HEAD_RELIABILITY_WEIGHT)
    ) {
        return undefined;
    }

    const confidence =
        reliability === undefined
            ? extraction.confidence
            : clampConfidence(
                  extraction.confidence *
                      Math.sqrt(reliability.partWeight * reliability.jointWeight),
              );
    const warnings = [...extraction.warnings];
    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
        pushWarning(warnings, "low_confidence");
    }

    return {
        yawRad: extraction.pose.yawRad,
        pitchRad: extraction.pose.pitchRad,
        rollRad: extraction.pose.rollRad,
        confidence,
        source: "face",
        warnings,
        outOfRangeFields: [],
    };
}

function extractHeadPoseRadians(face: Pick<SincroFaceMotionSnapshot, "confidence" | "headPose">):
    | {
          pose: HeadPoseRadians;
          confidence: number;
          warnings: CanonicalWarningCode[];
      }
    | undefined {
    const faceConfidence = clampConfidence(face.confidence);
    const matrix = face.headPose.matrix;
    if (matrix === undefined) {
        return extractEulerFallback(face, MATRIX_MISSING_CONFIDENCE_MAX, "face_matrix_missing");
    }

    const matrixPose = readFiniteFaceMatrixPose(matrix);
    if (matrixPose !== undefined) {
        return {
            pose: matrixPose,
            confidence: faceConfidence,
            warnings: [],
        };
    }

    return extractEulerFallback(face, MATRIX_INVALID_CONFIDENCE_MAX, "face_matrix_invalid");
}

function extractEulerFallback(
    face: Pick<SincroFaceMotionSnapshot, "confidence" | "headPose">,
    confidenceMax: number,
    warning: CanonicalWarningCode,
):
    | {
          pose: HeadPoseRadians;
          confidence: number;
          warnings: CanonicalWarningCode[];
      }
    | undefined {
    const pose = {
        yawRad: degToRad(face.headPose.yawDeg),
        pitchRad: degToRad(face.headPose.pitchDeg),
        rollRad: degToRad(face.headPose.rollDeg),
    };
    if (!isFiniteHeadPose(pose)) {
        return undefined;
    }
    return {
        pose,
        confidence: Math.min(clampConfidence(face.confidence), confidenceMax),
        warnings: [warning],
    };
}

function readFiniteFaceMatrixPose(matrix: readonly number[]): HeadPoseRadians | undefined {
    if (matrix.length !== 16 || !matrix.every((value) => Number.isFinite(value))) {
        return undefined;
    }

    /*
        MediaPipe FaceLandmarker の transformation matrix は face tracker snapshot と同じ式で
        回転成分を取り出す。canonical layer は matrix 全体や quaternion を保存せず、後段 contract の
        yaw/pitch/roll radian だけを保持する。
    */
    const r00 = matrix[0];
    const r10 = matrix[4];
    const r11 = matrix[5];
    const r12 = matrix[6];
    const r20 = matrix[8];
    const r21 = matrix[9];
    const r22 = matrix[10];
    const sy = Math.sqrt(r00 * r00 + r10 * r10);
    const singular = sy < 1e-6;
    return {
        pitchRad: singular ? Math.atan2(-r12, r11) : Math.atan2(r21, r22),
        yawRad: Math.atan2(-r20, sy),
        rollRad: singular ? 0 : Math.atan2(r10, r00),
    };
}

function isFiniteHeadPose(pose: HeadPoseRadians): boolean {
    return (
        Number.isFinite(pose.yawRad) &&
        Number.isFinite(pose.pitchRad) &&
        Number.isFinite(pose.rollRad)
    );
}

type HeadReliability = {
    part: ReliabilityMap["parts"]["head"];
    joint: ReliabilityMap["joints"]["head"];
    partWeight: number;
    jointWeight: number;
};

function resolveHeadReliability(
    reliability: ReliabilityMap | undefined,
): HeadReliability | undefined {
    if (reliability === undefined) {
        return undefined;
    }
    return {
        part: reliability.parts.head,
        joint: reliability.joints.head,
        partWeight: clampConfidence(reliability.parts.head.finalWeight),
        jointWeight: clampConfidence(reliability.joints.head.finalWeight),
    };
}

function degToRad(value: number): number {
    return value * (Math.PI / 180);
}
