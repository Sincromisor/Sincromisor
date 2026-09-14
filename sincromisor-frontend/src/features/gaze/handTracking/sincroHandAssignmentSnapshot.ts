/** 割当が共有する観測契約・距離条件・結果生成。推論や座標復元は行わない。 */
import type { SincroRoiObservation } from "../trackingRuntime/roiTracking/roiTrackingTypes";
import {
    cloneSincroHandSideSnapshot,
    createLostHandSideSnapshot,
    type SincroHandFeatureSnapshot,
    type SincroHandPoint2,
    type SincroHandSideSnapshot,
    type SincroHandSource,
    type SincroHandWarningCode,
} from "./sincroHandMotionSnapshot";

/** 全画面の正規化座標へ復元済みの手観測。左右ラベルは参考値で、Pose手首との距離を優先する。 */
export type SincroHandObservation = {
    handIndex: number;
    wrist: SincroHandPoint2;
    confidence: number;
    handednessLabel?: string;
    handednessScore: number;
    features: SincroHandFeatureSnapshot;
    warnings: SincroHandWarningCode[];
};

/** Poseが持つ本人基準の左右と全画面正規化手首座標。座標欠損は割当不能を表す。 */
export type SincroHandPoseWrist = {
    side: "left" | "right";
    point?: SincroHandPoint2;
    confidence: number;
};

/** 本人基準の左右ごとの割当結果。未検出側にも警告付きの状態を返す。 */
export type SincroHandAssignmentResult = {
    leftHand: SincroHandSideSnapshot;
    rightHand: SincroHandSideSnapshot;
};

/** 全画面正規化座標で、Pose手首から0.18以内の観測だけを候補にする。 */
export const HAND_ASSIGNMENT_MAX_DISTANCE = 0.18;
/** 距離差1e-6以下を同点として前回側・信頼度による解決へ進める。 */
export const HAND_TIE_EPSILON = 1e-6;

/** ROIの欠損・不整合を手追跡の警告へ変換する。 */
export function handWarningsFromRoi(
    roi: SincroRoiObservation | undefined,
): SincroHandWarningCode[] {
    if (roi === undefined) {
        return [];
    }
    const warnings: SincroHandWarningCode[] = [];
    if (roi.warnings.includes("roi_missing") || roi.source === "none") {
        warnings.push("roi_missing");
    }
    if (roi.warnings.includes("roi_inconsistent")) {
        warnings.push("roi_inconsistent");
    }
    return warnings;
}

/** 割当済み観測の値を結果へ渡す。特徴量・警告・ROIの参照は従来どおり保持する。 */
export function sideSnapshotFromObservation(input: {
    observation: SincroHandObservation;
    side: "left" | "right";
    source: SincroHandSource;
    roi?: SincroRoiObservation;
}): SincroHandSideSnapshot {
    return {
        detected: true,
        assignedSide: input.side,
        source: input.source,
        confidence: input.observation.confidence,
        handednessLabel: input.observation.handednessLabel,
        handednessScore: input.observation.handednessScore,
        roi: input.roi,
        fullFrameWrist: input.observation.wrist,
        features: input.observation.features,
        warnings: input.observation.warnings,
    };
}

/** 未検出状態を複製し、ランドマーク欠損・ROI・割当の警告をまとめる。 */
export function lostHand(
    side: "left" | "right",
    roi: SincroRoiObservation | undefined,
    warnings: SincroHandWarningCode[],
): SincroHandSideSnapshot {
    return {
        ...cloneSincroHandSideSnapshot(
            createLostHandSideSnapshot(side, [
                "landmarks_missing",
                ...handWarningsFromRoi(roi),
                ...warnings,
            ]),
        ),
        roi,
    };
}

/** 全画面正規化座標における手首間のユークリッド距離。 */
export function distance2d(left: SincroHandPoint2, right: SincroHandPoint2): number {
    return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
