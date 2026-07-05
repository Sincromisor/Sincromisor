import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    type CameraQualityPoseSample,
    type CameraQualityScore,
    createCameraQualityScore,
} from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";

const CAMERA_QUALITY_TIMING_HISTORY_LIMIT = 30;
const CAMERA_QUALITY_POSE_SAMPLE_LIMIT = 10;

/**
 * production sincro の Pose callback から camera quality score を作る入力境界。
 *
 * caller は DOM video element や `MediaStreamTrack` 本体を渡さず、その frame の pose snapshot、
 * video frame timing、video size、scrub 対象の track settings / readyState だけを渡す。
 * helper は raw settings object を保持せず、`createCameraQualityScore()` が返す scrub 済み
 * `CameraQualityScore.track` だけを latest score として保存する。Face-only / Hand-only callback は
 * この API を呼ばず、source none 相当の stop snapshot は `pose.trackingEnabled === false` として
 * latest score を破棄する。
 */
export type SincroCameraQualityRuntimePoseInput = {
    pose: SincroPoseMotionSnapshot;
    timing?: TrackerVideoFrameTiming;
    video: {
        width: number;
        height: number;
    };
    trackSettings?: MediaTrackSettings;
    trackReadyState?: MediaStreamTrackState;
};

/**
 * production observe-only reliability に渡す camera quality score の lifecycle owner。
 *
 * Pose frame だけで bounded timing / pose sample history を更新し、最新 score を
 * `getCameraQuality()` で observe-only input へ渡せる形にする。camera refresh、mode 切替、
 * tracking stop では `reset()` で history と latest score を破棄する。VRM、Debug Console、
 * MediaStreamTrack の所有や user-facing guide 表示は非対象である。
 */
export class SincroCameraQualityRuntime {
    private latestCameraQuality?: CameraQualityScore;
    private timingHistory: TrackerVideoFrameTiming[] = [];
    private poseSamples: CameraQualityPoseSample[] = [];

    /**
     * Pose callback の camera quality を生成し、同一 frame の reliability から読める latest score にする。
     *
     * `pose.trackingEnabled === false` は source none 相当の stop snapshot とみなし、score を捏造せず
     * latest score と bounded history を破棄する。raw `trackSettings` はこの method 内で scorer へ渡す
     * だけで保持しない。scorer が受理できない数値を受けた場合は bad / unknown component として返り、
     * helper 自体は例外変換を行わない。
     */
    updatePoseQuality(input: SincroCameraQualityRuntimePoseInput): CameraQualityScore | undefined {
        if (!input.pose.trackingEnabled) {
            this.reset();
            return undefined;
        }

        if (input.timing !== undefined) {
            this.timingHistory = [...this.timingHistory, cloneTiming(input.timing)].slice(
                -CAMERA_QUALITY_TIMING_HISTORY_LIMIT,
            );
        }
        this.poseSamples = [
            ...this.poseSamples,
            {
                poseDetected: input.pose.detected,
                poseConfidence: input.pose.confidence,
            },
        ].slice(-CAMERA_QUALITY_POSE_SAMPLE_LIMIT);

        this.latestCameraQuality = createCameraQualityScore({
            source: "camera",
            trackSettings: input.trackSettings,
            trackReadyState: input.trackReadyState,
            videoWidth: input.video.width,
            videoHeight: input.video.height,
            pose: input.pose,
            timing: input.timing,
            timingHistory: this.timingHistory,
            poseSamples: this.poseSamples,
        });
        return this.getCameraQuality();
    }

    /**
     * observe-only input 用の最新 camera quality score を clone して返す。
     *
     * Face / Hand callback は score を生成せず、この値を読むだけにする。返却値を caller が変更しても
     * runtime 内部の latest score や次 frame の reliability へ波及しない。
     */
    getCameraQuality(): CameraQualityScore | undefined {
        return this.latestCameraQuality === undefined
            ? undefined
            : structuredClone(this.latestCameraQuality);
    }

    /**
     * camera quality の bounded history と latest score を破棄する。
     *
     * observe-only pipeline reset と同じ lifecycle 境界で呼び、camera refresh / mode 切替 / tracking stop
     * をまたいで古い cadence や低 confidence history を次の camera session へ持ち越さない。
     */
    reset(): void {
        this.latestCameraQuality = undefined;
        this.timingHistory = [];
        this.poseSamples = [];
    }
}

function cloneTiming(timing: TrackerVideoFrameTiming): TrackerVideoFrameTiming {
    return { ...timing };
}
