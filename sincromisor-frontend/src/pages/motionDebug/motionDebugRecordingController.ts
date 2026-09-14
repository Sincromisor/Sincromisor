/**
 * motion-debug recording の start / stop / frame append と recorder lifecycle を管理する。
 * tracker callback と同じ mediaTimeMs の canonical / reliability / temporal / intent を保存し、download DOM は別 module に残す。
 */
import type { AvatarMotionProfile } from "../../character/avatarProfile/avatarMotionProfileTypes";
import type { InitialSincroCalibrationSession } from "../../character/calibration/initialSincroCalibration";
import type { OnlineSincroCalibrationState } from "../../character/calibration/onlineSincroCalibrationTypes";
import type { SincroMotionDebugLogManifest } from "../../character/motionEvaluation/motionDebugLogSchema";
import { SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION } from "../../character/motionEvaluation/motionDebugLogSchema";
import { createMotionDebugPhase7Snapshot } from "../../character/motionEvaluation/motionDebugPhase7Snapshot";
import {
    MotionDebugRecorder,
    type MotionDebugRecorderConfig,
    type MotionDebugRecorderFrameInput,
    type MotionDebugRecorderRecordFrameResult,
    type MotionDebugRecorderResult,
    type MotionDebugRecorderState,
} from "../../character/motionEvaluation/motionDebugRecorder";

import type { DebugConsoleSnapshot } from "../../features/debug/model/debugConsoleManager";

import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { TrackerRuntimeMediaPipeRawResult } from "../../features/gaze/trackingRuntime/mediaPipeRawResultSerializer";
import type { SincroTrackerWorkerStats } from "../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";
import type { TrackerRuntimePerformanceProfile } from "../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import {
    createPipelineConfigHash,
    normalizeMotionDebugBuildGitCommit,
} from "./motionDebugBuildProvenance";
import { createMotionDebugCameraConstraints } from "./motionDebugCameraStream";
import type { MotionDebugLiveFrame } from "./motionDebugLiveComputation";
import {
    createMotionDebugLiveFinalPoseSnapshot,
    createMotionDebugLivePhase6SolverSnapshot,
} from "./motionDebugPhase6Snapshots";
import { downloadMotionDebugRecording } from "./motionDebugRecordingDownload";
import type {
    MotionDebugCameraState,
    MotionDebugRecordingDownloadResult,
    MotionDebugRetargetUiConfig,
} from "./types";

type MotionDebugRecordingControllerParams = {
    video: HTMLVideoElement;
    getActiveStream: () => MediaStream | undefined;
    getCameraSource: () => MotionDebugCameraState["source"];
    getActiveFixtureUrl: () => string | undefined;
    getRetargetConfig: () => MotionDebugRetargetUiConfig;
    getTrackerStats: () => SincroTrackerWorkerStats;
    getDebugSnapshot: () => DebugConsoleSnapshot["sincroMotion"];
    getAvatarMotionProfile: () => AvatarMotionProfile | undefined;
    getInitialCalibrationSession?: () => InitialSincroCalibrationSession | undefined;
    getOnlineCalibrationState?: () => OnlineSincroCalibrationState | undefined;
    getActivePerformanceProfile: () => TrackerRuntimePerformanceProfile;
    getVrmUrl: () => string;
    onStateChange: (state: MotionDebugRecorderState) => void;
};

/** 算出済みフレームの保存と出力を所有し、追跡側の計算寿命から独立する。 */
export class MotionDebugRecordingController {
    private recorder = new MotionDebugRecorder();
    constructor(private readonly params: MotionDebugRecordingControllerParams) {}

    /** 入力ソースの構成を確定し、新しい記録だけを開始する。 */
    start(config?: Partial<MotionDebugRecorderConfig>): MotionDebugRecorderResult {
        if (this.recorder.getState().status === "recording") {
            return {
                ok: false,
                code: "already_recording",
                message: "Motion debug recorder is already recording.",
                state: this.recorder.getState(),
            };
        }

        const recorder = new MotionDebugRecorder(config);
        const manifest = this.createManifest();
        if (manifest === undefined) {
            const result: MotionDebugRecorderResult = {
                ok: false,
                code: "source_not_ready",
                message: "Start camera or load a video fixture before recording.",
                state: recorder.getState(),
            };
            this.params.onStateChange(result.state);
            return result;
        }

        const result = recorder.start(manifest);
        this.recorder = recorder;
        this.params.onStateChange(result.state);
        return result;
    }

    /** 記録を閉じる。ライブ描画と推定器の状態は保持する。 */
    stop(reason: MotionDebugRecorderState["stopReason"] = "user"): MotionDebugRecorderResult {
        const result = this.recorder.stop(reason);
        this.params.onStateChange(result.state);
        return result;
    }

    /** 保持している記録をブラウザーのダウンロードへ渡す。 */
    async download(options?: {
        compression?: MotionDebugRecorderConfig["compression"];
    }): Promise<MotionDebugRecordingDownloadResult> {
        const blobResult = await this.recorder.exportBlob(options);
        if (!blobResult.ok) {
            return blobResult;
        }

        const downloaded = downloadMotionDebugRecording(blobResult);
        return {
            ...downloaded,
            state: blobResult.state,
        };
    }

    /** 同じPose更新で算出済みの値を保存する。録画操作は推定状態を変更しない。 */
    recordPoseFrame(
        snapshot: SincroPoseMotionSnapshot,
        frame: MotionDebugLiveFrame,
        timing?: TrackerVideoFrameTiming,
        cameraQuality?: CameraQualityScore,
        mediapipe?: TrackerRuntimeMediaPipeRawResult,
    ): MotionDebugRecorderRecordFrameResult | undefined {
        if (this.recorder.getState().status !== "recording") {
            return undefined;
        }

        const { canonical, reliability, temporal, intent, hand } = frame.state;
        const { postProcessing, phase9 } = frame;
        const mediaTimeMs = canonical.timestamp.mediaTimeMs;
        const debugSnapshot = this.params.getDebugSnapshot();
        const phase6 = createMotionDebugLivePhase6SolverSnapshot(debugSnapshot.poseRetargetRuntime);
        const phase7 = createMotionDebugPhase7Snapshot({
            profile: this.params.getAvatarMotionProfile(),
            initialCalibration: this.params.getInitialCalibrationSession?.(),
            onlineCalibration: this.params.getOnlineCalibrationState?.(),
            activeCanonicalCalibration: canonical.calibration,
        });
        const finalPose = createMotionDebugLiveFinalPoseSnapshot(debugSnapshot.poseRetargetRuntime);
        const result = this.recorder.recordFrame({
            timestamp: createMotionDebugFrameTimestamp(mediaTimeMs, timing),
            video: {
                width: this.params.video.videoWidth,
                height: this.params.video.videoHeight,
            },
            ...(mediapipe === undefined ? {} : { mediapipe }),
            poseSnapshot: snapshot,
            hand,
            reliability,
            canonical,
            temporal,
            intent,
            postProcessing,
            solver: {
                poseRetarget: debugSnapshot.poseRetarget,
                poseRetargetRuntime: debugSnapshot.poseRetargetRuntime,
                phase6,
                phase7,
                phase9,
            },
            finalPose,
            metrics: {
                receivedAtPerformanceMs: performance.now(),
                tracker: this.params.getTrackerStats(),
                cameraQuality,
            },
            dedupeKey: {
                mediaTimeMs,
                poseLastUpdatedAtMs: snapshot.lastUpdatedAtMs ?? null,
                presentedFrames: timing?.presentedFrames,
            },
        });
        this.params.onStateChange(result.state);
        return result;
    }

    /** 録画UIへ現在の保存状態を返す。 */
    getState(): MotionDebugRecorderState {
        return this.recorder.getState();
    }

    /**
     * active source の recording manifest を作り、build provenance は検証済み commit だけを保存する。
     * commit が未注入または不正でも source が ready なら manifest を生成し、recording を継続する。
     */
    private createManifest(
        buildGitCommit: string | undefined = __SINCROMISOR_GIT_COMMIT__,
    ): SincroMotionDebugLogManifest | undefined {
        const source = this.source();
        const [track] = this.params.getActiveStream()?.getVideoTracks() ?? [];
        if (source === undefined || track === undefined) {
            return undefined;
        }
        const performanceProfile = this.params.getActivePerformanceProfile();
        const retargetConfig = this.params.getRetargetConfig();
        const pipeline = {
            poseTargetInferenceFps: performanceProfile.cadence.poseFps,
            performanceProfile,
            retargetConfig,
        };
        const gitCommit = normalizeMotionDebugBuildGitCommit(buildGitCommit);

        return {
            schemaVersion: SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
            createdAtIso: new Date().toISOString(),
            source,
            environment: {
                userAgent: navigator.userAgent,
                devicePixelRatio: window.devicePixelRatio,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                },
                timeOriginMs: performance.timeOrigin,
            },
            build: {
                appVersion: __SINCROMISOR_FRONTEND_VERSION__ ?? "unknown",
                ...(gitCommit === undefined ? {} : { gitCommit }),
                packageVersions: {
                    "sincromisor-frontend": __SINCROMISOR_FRONTEND_VERSION__ ?? "unknown",
                    "@mediapipe/tasks-vision": __MEDIAPIPE_TASKS_VISION_VERSION__ ?? "unknown",
                },
                configHash: createPipelineConfigHash(pipeline),
            },
            camera: {
                requestedConstraints:
                    this.params.getCameraSource() === "camera"
                        ? createMotionDebugCameraConstraints(performanceProfile)
                        : { fixtureUrl: this.params.getActiveFixtureUrl() },
                actualSettings: scrubCameraSettings(track.getSettings()),
            },
            pipeline,
            avatar: {
                avatarProfileId: this.params.getVrmUrl(),
                boneCapabilities: {},
            },
        };
    }

    private source(): SincroMotionDebugLogManifest["source"] | undefined {
        const cameraSource = this.params.getCameraSource();
        if (cameraSource === "camera") {
            return { kind: "live-camera" };
        }
        if (cameraSource === "fixture") {
            return {
                kind: "video-fixture",
                fixtureId: this.params.getActiveFixtureUrl(),
            };
        }
        return undefined;
    }
}

/** 計算済みの映像時刻へ元コールバックの提示時刻情報を添え、保存の時刻対応を保つ。 */
function createMotionDebugFrameTimestamp(
    mediaTimeMs: number,
    timing?: TrackerVideoFrameTiming,
): MotionDebugRecorderFrameInput["timestamp"] {
    if (timing === undefined) {
        return { mediaTimeMs };
    }
    return {
        mediaTimeMs,
        presentationTimeMs: timing.presentationTimeMs,
        expectedDisplayTimeMs: timing.expectedDisplayTimeMs,
        presentedFrames: timing.presentedFrames,
        droppedPresentedFrames: timing.droppedPresentedFrames,
        clockSource: timing.source,
    };
}

function scrubCameraSettings(
    settings: MediaTrackSettings,
): NonNullable<SincroMotionDebugLogManifest["camera"]["actualSettings"]> {
    const actualSettings: NonNullable<SincroMotionDebugLogManifest["camera"]["actualSettings"]> =
        {};
    if (settings.width !== undefined && Number.isFinite(settings.width)) {
        actualSettings.width = settings.width;
    }
    if (settings.height !== undefined && Number.isFinite(settings.height)) {
        actualSettings.height = settings.height;
    }
    if (settings.frameRate !== undefined && Number.isFinite(settings.frameRate)) {
        actualSettings.frameRate = settings.frameRate;
    }
    if (typeof settings.facingMode === "string") {
        actualSettings.facingMode = settings.facingMode;
    }
    return actualSettings;
}
