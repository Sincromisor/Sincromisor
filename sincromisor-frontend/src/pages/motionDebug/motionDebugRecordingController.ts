import type { CanonicalUpperBodyState } from "../../character/canonical/canonicalUpperBodyState";
import type { SincroMotionDebugLogManifest } from "../../character/motionEvaluation/motionDebugLogSchema";
import { SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION } from "../../character/motionEvaluation/motionDebugLogSchema";
import {
    MotionDebugRecorder,
    type MotionDebugRecorderConfig,
    type MotionDebugRecorderRecordFrameResult,
    type MotionDebugRecorderResult,
    type MotionDebugRecorderState,
} from "../../character/motionEvaluation/motionDebugRecorder";
import type { DebugConsoleSnapshot } from "../../features/debug/model/debugConsoleManager";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";
import { MOTION_DEBUG_CAMERA_CONSTRAINTS } from "./motionDebugCameraStream";
import { createMotionDebugCanonicalState } from "./motionDebugCanonicalState";
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
    getFaceSnapshot: () => SincroFaceMotionSnapshot;
    getVrmUrl: () => string;
    poseTargetInferenceFps: number;
    onCanonicalStateChange: (state: CanonicalUpperBodyState | undefined) => void;
    onStateChange: (state: MotionDebugRecorderState) => void;
};

export class MotionDebugRecordingController {
    private recorder = new MotionDebugRecorder();
    private latestCanonical?: CanonicalUpperBodyState;

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
    ): MotionDebugRecorderRecordFrameResult | undefined {
        const mediaTimeMs = Number.isFinite(this.params.video.currentTime)
            ? this.params.video.currentTime * 1000
            : 0;
        const canonical = createMotionDebugCanonicalState({
            pose: snapshot,
            face: this.params.getFaceSnapshot(),
            previous: this.latestCanonical,
            mediaTimeMs,
        });
        this.latestCanonical = canonical;
        this.params.onCanonicalStateChange(canonical);

        if (this.recorder.getState().status !== "recording") {
            return undefined;
        }

        const debugSnapshot = this.params.getDebugSnapshot();
        const result = this.recorder.recordFrame({
            timestamp: {
                mediaTimeMs,
            },
            video: {
                width: this.params.video.videoWidth,
                height: this.params.video.videoHeight,
            },
            poseSnapshot: snapshot,
            canonical,
            solver: {
                poseRetarget: debugSnapshot.poseRetarget,
                poseRetargetRuntime: debugSnapshot.poseRetargetRuntime,
            },
            metrics: {
                receivedAtPerformanceMs: performance.now(),
                tracker: this.params.getTrackerStats(),
            },
            dedupeKey: {
                mediaTimeMs,
                poseLastUpdatedAtMs: snapshot.lastUpdatedAtMs ?? null,
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
    }

    private createManifest(): SincroMotionDebugLogManifest | undefined {
        const source = this.source();
        const [track] = this.params.getActiveStream()?.getVideoTracks() ?? [];
        if (source === undefined || track === undefined) {
            return undefined;
        }

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
                        ? MOTION_DEBUG_CAMERA_CONSTRAINTS
                        : { fixtureUrl: this.params.getActiveFixtureUrl() },
                actualSettings: scrubCameraSettings(track.getSettings()),
            },
            pipeline: {
                poseTargetInferenceFps: this.params.poseTargetInferenceFps,
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
