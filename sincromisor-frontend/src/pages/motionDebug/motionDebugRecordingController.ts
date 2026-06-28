import type { AvatarMotionProfile } from "../../character/avatarProfile/avatarMotionProfile";
import type { InitialSincroCalibrationSession } from "../../character/calibration/initialSincroCalibration";
import type { OnlineSincroCalibrationState } from "../../character/calibration/onlineSincroCalibrationTypes";
import type { CanonicalUpperBodyState } from "../../character/canonical/canonicalUpperBodyState";
import type { SincroMotionDebugLogManifest } from "../../character/motionEvaluation/motionDebugLogSchema";
import { SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION } from "../../character/motionEvaluation/motionDebugLogSchema";
import { createMotionDebugPhase7Snapshot } from "../../character/motionEvaluation/motionDebugPhase7Snapshot";
import {
    createMotionDebugPhase9SemanticSnapshot,
    type MotionDebugPhase9SemanticSnapshot,
} from "../../character/motionEvaluation/motionDebugPhase9Snapshot";
import {
    MotionDebugRecorder,
    type MotionDebugRecorderConfig,
    type MotionDebugRecorderFrameInput,
    type MotionDebugRecorderRecordFrameResult,
    type MotionDebugRecorderResult,
    type MotionDebugRecorderState,
} from "../../character/motionEvaluation/motionDebugRecorder";
import { MotionIntentEstimator } from "../../character/motionIntent/motionIntentEstimator";
import type { MotionIntentState } from "../../character/motionIntent/motionIntentState";
import type { MotionPostProcessingResult } from "../../character/motionPostProcessing/motionPostProcessingState";
import { NoopMotionPostProcessor } from "../../character/motionPostProcessing/noopMotionPostProcessor";
import {
    createDefaultReliabilityMap,
    type ReliabilityMap,
} from "../../character/reliability/reliabilityMap";
import { TemporalStateEstimator } from "../../character/temporal/temporalStateEstimator";
import type {
    TemporalUpperBodyState,
    TemporalWarningCode,
} from "../../character/temporal/temporalUpperBodyState";
import { uniqueWarnings } from "../../character/temporal/temporalWarnings";
import type { DebugConsoleSnapshot } from "../../features/debug/model/debugConsoleManager";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { SincroTrackerWorkerStats } from "../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";
import type { TrackerRuntimePerformanceProfile } from "../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import { frontendLogger } from "../../shared/logging/appLogger";
import { createMotionDebugCameraConstraints } from "./motionDebugCameraStream";
import {
    createMotionDebugCanonicalReliabilityInput,
    createMotionDebugCanonicalState,
} from "./motionDebugCanonicalState";
import {
    createMotionDebugLiveFinalPoseSnapshot,
    createMotionDebugLivePhase6SolverSnapshot,
} from "./motionDebugPhase6Snapshots";
import { downloadMotionDebugRecording } from "./motionDebugRecordingDownload";
import type {
    MotionDebugCameraState,
    MotionDebugCanonicalReliabilityInput,
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
    getFaceSnapshot: () => SincroFaceMotionSnapshot;
    getHandSnapshot: () => SincroHandMotionSnapshot | undefined;
    getAvatarMotionProfile: () => AvatarMotionProfile | undefined;
    getInitialCalibrationSession?: () => InitialSincroCalibrationSession | undefined;
    getOnlineCalibrationState?: () => OnlineSincroCalibrationState | undefined;
    getActivePerformanceProfile: () => TrackerRuntimePerformanceProfile;
    getVrmUrl: () => string;
    onCanonicalStateChange: (state: CanonicalUpperBodyState | undefined) => void;
    onCanonicalReliabilityInputChange: (
        state: MotionDebugCanonicalReliabilityInput | undefined,
    ) => void;
    onReliabilityStateChange: (state: ReliabilityMap | undefined) => void;
    onTemporalStateChange: (state: TemporalUpperBodyState | undefined) => void;
    onIntentStateChange: (state: MotionIntentState | undefined) => void;
    onPostProcessingStateChange: (state: MotionPostProcessingResult | undefined) => void;
    onStateChange: (state: MotionDebugRecorderState) => void;
};

export class MotionDebugRecordingController {
    private recorder = new MotionDebugRecorder();
    private readonly temporalEstimator = new TemporalStateEstimator();
    private readonly intentEstimator = new MotionIntentEstimator();
    private readonly postProcessor = new NoopMotionPostProcessor();
    private latestCanonical?: CanonicalUpperBodyState;
    private latestPhase9?: MotionDebugPhase9SemanticSnapshot;

    constructor(private readonly params: MotionDebugRecordingControllerParams) {}

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

    stop(reason: MotionDebugRecorderState["stopReason"] = "user"): MotionDebugRecorderResult {
        const result = this.recorder.stop(reason);
        if (result.ok) {
            this.resetCanonicalState();
            this.resetReliabilityState();
            this.resetTemporalState();
        }
        this.params.onStateChange(result.state);
        return result;
    }

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

    recordPoseFrame(
        snapshot: SincroPoseMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
        cameraQuality?: CameraQualityScore,
        reliability?: ReliabilityMap,
        temporal?: TemporalUpperBodyState,
    ): MotionDebugRecorderRecordFrameResult | undefined {
        const mediaTimeMs = timing?.mediaTimeMs ?? fallbackVideoMediaTimeMs(this.params.video);
        const canonical = createMotionDebugCanonicalState({
            pose: snapshot,
            face: this.params.getFaceSnapshot(),
            previous: this.latestCanonical,
            mediaTimeMs,
            reliability,
        });
        this.latestCanonical = canonical;
        this.params.onCanonicalStateChange(canonical);
        this.params.onCanonicalReliabilityInputChange(
            createMotionDebugCanonicalReliabilityInput(reliability),
        );
        const frameReliability = reliability ?? createDefaultReliabilityMap(mediaTimeMs);
        this.params.onReliabilityStateChange(frameReliability);
        const frameTemporal = this.resolveTemporalState({
            canonical,
            reliability: frameReliability,
            mediaTimeMs,
            temporal,
        });
        this.params.onTemporalStateChange(frameTemporal);
        const intent = this.intentEstimator.update({
            temporal: frameTemporal,
            reliability: frameReliability,
            hand: this.params.getHandSnapshot(),
            mediaTimeMs,
        });
        this.params.onIntentStateChange(intent);
        const postProcessing = this.postProcessor.process({
            canonical,
            temporal: frameTemporal,
            intent,
            reliability: frameReliability,
            mediaTimeMs,
            source: this.params.getCameraSource() === "fixture" ? "fixture" : "live",
        });
        this.params.onPostProcessingStateChange(postProcessing);
        const phase9 = createMotionDebugPhase9SemanticSnapshot({
            intent,
            profile: this.params.getAvatarMotionProfile(),
            hand: this.params.getHandSnapshot(),
            previousFinger: this.latestPhase9?.finger,
        });
        this.latestPhase9 = phase9;

        if (this.recorder.getState().status !== "recording") {
            return undefined;
        }

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
            poseSnapshot: snapshot,
            hand: this.params.getHandSnapshot(),
            reliability: frameReliability,
            canonical,
            temporal: frameTemporal,
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

    getState(): MotionDebugRecorderState {
        return this.recorder.getState();
    }

    resetCanonicalState(): void {
        this.latestCanonical = undefined;
        this.params.onCanonicalStateChange(undefined);
        this.params.onCanonicalReliabilityInputChange(undefined);
    }

    resetReliabilityState(): void {
        this.params.onReliabilityStateChange(undefined);
    }

    resetTemporalState(): void {
        this.temporalEstimator.reset();
        this.intentEstimator.reset();
        this.latestPhase9 = undefined;
        this.params.onTemporalStateChange(undefined);
        this.params.onIntentStateChange(undefined);
        this.params.onPostProcessingStateChange(undefined);
    }

    private resolveTemporalState(options: ResolveTemporalStateOptions): TemporalUpperBodyState {
        if (options.temporal === undefined) {
            return this.temporalEstimator.update({
                canonical: options.canonical,
                reliability: options.reliability,
                mediaTimeMs: options.mediaTimeMs,
            });
        }
        if (!hasTemporalTimestampMismatch(options.temporal, options.mediaTimeMs)) {
            return options.temporal;
        }
        warnTemporalTimestampMismatch(options.temporal, options.mediaTimeMs);
        return addTemporalWarning(options.temporal, "out_of_range");
    }

    private createManifest(): SincroMotionDebugLogManifest | undefined {
        const source = this.source();
        const [track] = this.params.getActiveStream()?.getVideoTracks() ?? [];
        if (source === undefined || track === undefined) {
            return undefined;
        }
        const performanceProfile = this.params.getActivePerformanceProfile();

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
                appVersion: "0.0.0",
                packageVersions: {},
                configHash: "motion-debug-default",
            },
            camera: {
                requestedConstraints:
                    this.params.getCameraSource() === "camera"
                        ? createMotionDebugCameraConstraints(performanceProfile)
                        : { fixtureUrl: this.params.getActiveFixtureUrl() },
                actualSettings: scrubCameraSettings(track.getSettings()),
            },
            pipeline: {
                poseTargetInferenceFps: performanceProfile.cadence.poseFps,
                performanceProfile,
                retargetConfig: this.params.getRetargetConfig(),
            },
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

type ResolveTemporalStateOptions = {
    canonical: CanonicalUpperBodyState;
    reliability: ReliabilityMap;
    mediaTimeMs: number;
    temporal?: TemporalUpperBodyState;
};

function addTemporalWarning(
    temporal: TemporalUpperBodyState,
    warning: TemporalWarningCode,
): TemporalUpperBodyState {
    return {
        ...temporal,
        warnings: uniqueWarnings([...temporal.warnings, warning]),
    };
}

function hasTemporalTimestampMismatch(
    temporal: TemporalUpperBodyState,
    mediaTimeMs: number,
): boolean {
    return temporal.timestamp.mediaTimeMs !== mediaTimeMs;
}

function warnTemporalTimestampMismatch(
    temporal: TemporalUpperBodyState,
    mediaTimeMs: number,
): void {
    frontendLogger.warn("Motion debug temporal timestamp differs from frame timestamp.", {
        frameMediaTimeMs: mediaTimeMs,
        temporalMediaTimeMs: temporal.timestamp.mediaTimeMs,
    });
}

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

function fallbackVideoMediaTimeMs(video: HTMLVideoElement): number {
    return Number.isFinite(video.currentTime) ? video.currentTime * 1000 : 0;
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
