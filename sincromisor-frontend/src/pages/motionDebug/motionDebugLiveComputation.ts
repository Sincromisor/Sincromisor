/** ライブ入力の寿命で共通計算を保持し、検証専用の後処理と保存用のphase9を添える。 */
import type { AvatarMotionProfile } from "../../character/avatarProfile/avatarMotionProfileTypes";
import {
    createMotionDebugPhase9SemanticSnapshot,
    type MotionDebugPhase9SemanticSnapshot,
} from "../../character/motionEvaluation/motionDebugPhase9Snapshot";
import type { MotionPostProcessingResult } from "../../character/motionPostProcessing/motionPostProcessingState";
import { NoopMotionPostProcessor } from "../../character/motionPostProcessing/noopMotionPostProcessor";
import {
    SincroMotionObserveOnlyPipeline,
    type SincroMotionObserveOnlyPipelineInput,
} from "../../character/runtime/sincroMotionObserveOnlyPipeline";
import type { SincroMotionPipelineState } from "../../character/runtime/sincroMotionPipelineState";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";

/** 描画と録画が共有する同一Poseフレームの算出結果。診断保存値は共通状態から分ける。 */
export type MotionDebugLiveFrame = {
    state: SincroMotionPipelineState &
        Required<
            Pick<SincroMotionPipelineState, "canonical" | "reliability" | "temporal" | "intent">
        >;
    postProcessing: MotionPostProcessingResult;
    phase9: MotionDebugPhase9SemanticSnapshot;
};

/** 追跡接続ごとの共通推定と指の履歴を所有する。 */
export class MotionDebugLiveComputation {
    /** FaceとHandも本番と同じ到着順で観測し、状態付き推定はPoseだけで進める。 */
    readonly pipeline = new SincroMotionObserveOnlyPipeline();
    private readonly postProcessor = new NoopMotionPostProcessor();

    /** 入力停止・切替時だけ履歴を捨てる。録画開始停止からは呼ばない。 */
    reset(): void {
        this.pipeline.reset();
    }

    /** 本番の観測経路を一度進め、検証専用の派生値を同じ時刻で算出する。 */
    updatePose(
        snapshot: SincroPoseMotionSnapshot,
        input: SincroMotionObserveOnlyPipelineInput,
        source: "fixture" | "live",
        profile?: AvatarMotionProfile,
    ): MotionDebugLiveFrame | undefined {
        const { state, summary } = this.pipeline.updatePose(snapshot, input);
        if (summary.temporal.status === "invalid_input") return undefined;
        const { canonical, reliability, temporal, intent } = state;
        if (!canonical || !reliability || !temporal || !intent) return undefined;
        const postProcessing = this.postProcessor.process({
            canonical,
            reliability,
            temporal,
            intent,
            mediaTimeMs: canonical.timestamp.mediaTimeMs,
            source,
        });
        const phase9 = createMotionDebugPhase9SemanticSnapshot({
            intent,
            profile,
            hand: state.hand,
        });
        return {
            state: { ...state, canonical, reliability, temporal, intent },
            postProcessing,
            phase9,
        };
    }
}

/** 映像時刻を優先し、推定器に壁時計や映像DOMを持ち込まず観測を渡す。 */
export function createMotionDebugLiveInput(
    video: HTMLVideoElement,
    timing: TrackerVideoFrameTiming | undefined,
    updatedAtMs: number | undefined,
    cameraQuality: CameraQualityScore | undefined,
): SincroMotionObserveOnlyPipelineInput {
    const mediaTimeMs =
        timing?.mediaTimeMs ??
        updatedAtMs ??
        (Number.isFinite(video.currentTime) ? video.currentTime * 1000 : 0);
    return {
        mediaTimeMs,
        receivedAtMs: timing?.receivedAtPerformanceMs ?? mediaTimeMs,
        video: { width: video.videoWidth, height: video.videoHeight },
        cameraQuality,
    };
}
