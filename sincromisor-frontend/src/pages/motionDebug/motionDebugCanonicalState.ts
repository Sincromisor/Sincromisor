/**
 * tracker callback 由来の pose / face / hand snapshot から canonical と reliability 入力を作る橋渡し。
 * MediaPipe raw result や VRM object は読まず、motion-debug recording に保存可能な低次元 slot だけを生成する。
 */

import type { CanonicalUpperBodyState } from "../../character/canonical/canonicalUpperBodyState";
import type { ReliabilityMap } from "../../character/reliability/reliabilityMap";
import { computeSincroCanonicalMotion } from "../../character/runtime/sincroMotionComputation";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { MotionDebugCanonicalReliabilityInput } from "./types";

export type MotionDebugCanonicalStateInput = {
    pose: SincroPoseMotionSnapshot;
    face?: Pick<
        SincroFaceMotionSnapshot,
        "detected" | "confidence" | "headPose" | "source" | "warnings"
    >;
    previous?: CanonicalUpperBodyState;
    mediaTimeMs: number;
    reliability?: ReliabilityMap;
};

/** 再生の欠損値補完にも本番と同じ共通表現の計算を用いる。 */
export function createMotionDebugCanonicalState(
    input: MotionDebugCanonicalStateInput,
): CanonicalUpperBodyState {
    return computeSincroCanonicalMotion(input);
}

export function createMotionDebugCanonicalReliabilityInput(
    reliability: ReliabilityMap | undefined,
): MotionDebugCanonicalReliabilityInput | undefined {
    if (reliability === undefined) {
        return undefined;
    }
    return {
        schemaVersion: reliability.schemaVersion,
        mediaTimeMs: reliability.timestamp.mediaTimeMs,
        leftArm: {
            partWeight: reliability.parts.leftArm.finalWeight,
            minJointWeight: Math.min(
                reliability.joints.leftShoulder.finalWeight,
                reliability.joints.leftElbow.finalWeight,
                reliability.joints.leftWrist.finalWeight,
            ),
        },
        rightArm: {
            partWeight: reliability.parts.rightArm.finalWeight,
            minJointWeight: Math.min(
                reliability.joints.rightShoulder.finalWeight,
                reliability.joints.rightElbow.finalWeight,
                reliability.joints.rightWrist.finalWeight,
            ),
        },
    };
}
