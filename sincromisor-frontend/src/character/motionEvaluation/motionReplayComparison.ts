import type { VRM } from "@pixiv/three-vrm";
import { normalizeSincroFaceLandmarkerResult } from "../../features/gaze/faceTracking/sincroFaceTrackerNormalizer";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { normalizeSincroPoseLandmarkerResult } from "../../features/gaze/poseTracking/sincroPoseTrackerNormalizer";
import { toMinimalAvatarMotionProfile } from "../avatarProfile/avatarMotionProfileClone";
import type { GestureIntentObservation } from "../motionIntent/motionIntentEstimator";
import {
    type SincroPoseRetargetConfig,
    SincroPoseRetargeter,
} from "../retargeting/sincroPoseRetargeter";
import { SincroMotionObserveOnlyPipeline } from "../runtime/sincroMotionObserveOnlyPipeline";
import { SincroVrmPoseComposerService } from "../runtime/sincroVrmPoseComposer";
import { type MotionReplayApplyContext, MotionReplayPlayer } from "./motionReplayPlayer";

/** 再計算開始点・設定・任意の再推論Hand観測。渡されたVRMは読込直後の正規化骨格でなければならない。 */
export type MotionReplayComparisonInput = {
    recordingText: string;
    vrm: VRM;
    source: "mediapipe-raw-result" | "pose-snapshot";
    config?: Partial<SincroPoseRetargetConfig>;
    handObservations?: ReadonlyMap<number, SincroHandMotionSnapshot>;
    gestureObservations?: ReadonlyMap<number, GestureIntentObservation>;
};

/**
 * 既存の再生パーサーから共通計算→本番リターゲット→合成を同一時刻で実行する。
 * 呼出しごとに全所有者を新規作成し、保存された信頼性・共通表現・時系列・最終姿勢は一切再利用しない。
 * GPU描画はせず、適用予定のfinalPoseを返す。映像との目視は通常の再生APIで行う。
 */
export function recomputeMotionReplay(input: MotionReplayComparisonInput) {
    const pipeline = new SincroMotionObserveOnlyPipeline();
    const retargeter = new SincroPoseRetargeter(input.config);
    retargeter.attachVrm(input.vrm);
    const profile = retargeter.getAvatarMotionProfile();
    if (!profile) throw new Error("比較用VRMの骨格計測に失敗した。");
    const minimalProfile = toMinimalAvatarMotionProfile(profile);
    const composer = new SincroVrmPoseComposerService();
    let previousTimeMs: number | undefined;
    const apply = (pose: SincroPoseMotionSnapshot, context: MotionReplayApplyContext) => {
        const time = context.mediaTimeMs;
        if (previousTimeMs !== undefined && time <= previousTimeMs)
            throw new Error("比較入力の時刻は厳密な昇順でなければならない。");
        const hand = input.handObservations?.get(time);
        if (hand) pipeline.updateHand(hand, { mediaTimeMs: time, video: context.frame.video });
        const { state } = pipeline.updatePose(pose, {
            hand,
            gesture: input.gestureObservations?.get(time),
            mediaTimeMs: time,
            video: context.frame.video,
        });
        const frame = retargeter.retarget(pose, time, {
            temporal: state.temporal,
            profile: minimalProfile,
            mediaTimeMs: time,
        });
        const finalPose = composer.compose({
            frame,
            profile,
            deltaSeconds: previousTimeMs === undefined ? 1 / 60 : (time - previousTimeMs) / 1000,
            mediaTimeMs: time,
            semanticFinger: {
                mode: "composer",
                intent: state.intent,
                hand,
                mediaTimeMs: time,
                poseMediaTimeMs: time,
                temporal: state.temporal,
                trackingEnabled: pose.trackingEnabled,
            },
        });
        previousTimeMs = time;
        return {
            mediaTimeMs: time,
            canonical: state.canonical,
            temporal: state.temporal,
            retarget: frame,
            finalPose,
        };
    };
    const player = new MotionReplayPlayer({
        readSnapshot: () => {
            throw new Error("比較計算は保存姿勢を読み返さない。");
        },
        applyPoseSnapshot: apply,
        applyRawResult: (raw, context) => {
            if (!raw.pose) throw new Error("Poseの生結果が無いフレームは再計算できない。");
            if (raw.face)
                pipeline.updateFace(
                    normalizeSincroFaceLandmarkerResult({
                        result: raw.face,
                        inferenceTimeMs: 0,
                        inferenceFps: 0,
                        nowMs: context.mediaTimeMs,
                        source: "full-frame",
                        warnings: [],
                    }),
                    { mediaTimeMs: context.mediaTimeMs, video: context.frame.video },
                );
            const pose = normalizeSincroPoseLandmarkerResult({
                result: raw.pose,
                nowMs: context.mediaTimeMs,
                inferenceTimeMs: 0,
                inferenceFps: 0,
                consecutiveFailures: 0,
            }).snapshot;
            return apply(pose, context);
        },
    });
    const loaded = player.loadRecordingText(input.recordingText);
    if (!loaded.ok) throw new Error(loaded.message);
    const samples: ReturnType<typeof apply>[] = [];
    for (let index = 0; index < player.frameCount(); index++) {
        const result =
            index === 0 ? player.startReplay({ mode: input.source }) : player.stepReplay(index);
        if (!result.ok) throw new Error(result.message);
        samples.push(result.snapshot);
    }
    return {
        source: input.source,
        handSource: input.handObservations ? "video-reinference" : "unavailable",
        profile,
        config: input.config,
        samples,
    };
}
