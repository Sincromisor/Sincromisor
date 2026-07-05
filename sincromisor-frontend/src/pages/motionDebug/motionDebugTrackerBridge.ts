/**
 * TrackerRuntime callback から retarget、reliability、temporal、intent、recording を接続する bridge。
 * tracker runtime / Worker は canonical 生成や recorder を所有しないため、この module が motion-debug page 側の同期点になる。
 */
import type { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import { createPoseReliabilityMap } from "../../character/reliability/poseReliabilityEstimator";
import {
    parseReliabilityMap,
    type ReliabilityMap,
} from "../../character/reliability/reliabilityMap";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { TrackerRuntimeMediaPipeRawResult } from "../../features/gaze/trackingRuntime/mediaPipeRawResultSerializer";
import type { SincroTrackerWorkerStats } from "../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";
import { TrackerRuntime } from "../../features/gaze/trackingRuntime/trackerRuntime";
import type { TrackerRuntimePerformanceProfile } from "../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import { frontendLogger } from "../../shared/logging/appLogger";
import type { MotionDebugCameraRuntime } from "./motionDebugCameraRuntime";
import type { MotionDebugRecordingController } from "./motionDebugRecordingController";
import type { MotionDebugPoseOverlayRenderer } from "./poseOverlayRenderer";
import type { MotionDebugSnapshot } from "./types";

type MotionDebugTrackerBridgeParams = {
    video: HTMLVideoElement;
    camera: MotionDebugCameraRuntime;
    behaviorState: CharacterBehaviorState;
    debugConsole: DebugConsoleManager;
    overlayRenderer: MotionDebugPoseOverlayRenderer;
    recording: MotionDebugRecordingController;
    onError: (error: unknown) => void;
};

function resolvePoseReliabilityMediaTimeMs(
    snapshot: SincroPoseMotionSnapshot,
    timing?: TrackerVideoFrameTiming,
): number {
    return timing?.mediaTimeMs ?? snapshot.lastUpdatedAtMs ?? 0;
}

export class MotionDebugTrackerBridge {
    private readonly trackerRuntime: TrackerRuntime;
    private latestFaceSnapshot: SincroFaceMotionSnapshot;
    private latestHandSnapshot?: SincroHandMotionSnapshot;
    private latestPoseSnapshot: SincroPoseMotionSnapshot = DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT;
    private latestReliability?: MotionDebugSnapshot["reliability"];
    private latestMediaPipeRaw?: TrackerRuntimeMediaPipeRawResult;
    private latestTrackerStats: SincroTrackerWorkerStats;

    constructor(private readonly params: MotionDebugTrackerBridgeParams) {
        this.trackerRuntime = new TrackerRuntime(params.video);
        const debugSnapshot = params.debugConsole.getSnapshot().sincroMotion;
        this.latestFaceSnapshot = debugSnapshot.face;
        this.latestTrackerStats = debugSnapshot.tracker;
    }

    async start(
        track: MediaStreamTrack,
        performanceProfile: TrackerRuntimePerformanceProfile,
    ): Promise<void> {
        await this.trackerRuntime.startFaceTracking(
            track,
            {
                onFaceMotion: (snapshot, timing) => {
                    this.handleFaceMotion(snapshot, timing);
                },
                onHandMotion: (snapshot, timing) => {
                    this.handleHandMotion(snapshot, timing);
                },
                onPoseMotion: (snapshot, timing) => {
                    this.handlePoseMotion(snapshot, timing, true);
                },
                onPoseFallback: (snapshot, timing) => {
                    this.handlePoseMotion(snapshot, timing, false);
                },
                onMediaPipeRawResult: (result, timing) => {
                    this.handleMediaPipeRawResult(result, timing);
                },
                onTrackerStats: (snapshot) => {
                    this.latestTrackerStats = snapshot;
                    this.params.debugConsole.updateSincroTrackerStats(snapshot);
                },
                onError: (error) => {
                    this.params.onError(error);
                },
            },
            undefined,
            {
                enabled: true,
                ignorePerformanceFallback: true,
                performanceProfile,
                hand: {
                    enabled: true,
                },
            },
        );
    }

    stop(reason: string): void {
        this.trackerRuntime.stopFaceTracking(reason);
    }

    applyReplayPoseSnapshot(
        snapshot: SincroPoseMotionSnapshot,
        mediaTimeMs: number,
        renderOnce: () => void,
    ): void {
        this.latestPoseSnapshot = snapshot;
        this.params.behaviorState.applyPoseMotion(snapshot, mediaTimeMs);
        this.params.debugConsole.updateSincroPoseMotion(snapshot);
        this.params.overlayRenderer.render(snapshot, this.params.video);
        renderOnce();
    }

    setPoseSnapshot(snapshot: SincroPoseMotionSnapshot): SincroPoseMotionSnapshot {
        const previousPose = this.latestPoseSnapshot;
        this.latestPoseSnapshot = snapshot;
        return previousPose;
    }

    setFaceSnapshot(snapshot: SincroFaceMotionSnapshot): void {
        this.latestFaceSnapshot = snapshot;
    }

    setHandSnapshot(snapshot: SincroHandMotionSnapshot | undefined): void {
        this.latestHandSnapshot = snapshot;
    }

    updateLiveReliability(
        snapshot: SincroPoseMotionSnapshot,
        previousPose: SincroPoseMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        const previousReliability = this.latestValidReliability();
        this.latestReliability = createPoseReliabilityMap({
            pose: snapshot,
            ...(this.latestHandSnapshot === undefined ? {} : { hand: this.latestHandSnapshot }),
            face: this.latestFaceSnapshot,
            cameraQuality: this.params.camera.getCameraQuality(),
            previous:
                previousReliability === undefined
                    ? undefined
                    : {
                          pose: previousPose,
                          mediaTimeMs: previousReliability.timestamp.mediaTimeMs,
                          reliability: previousReliability,
                      },
            mediaTimeMs: resolvePoseReliabilityMediaTimeMs(snapshot, timing),
            video: {
                width: this.params.video.videoWidth,
                height: this.params.video.videoHeight,
            },
        });
    }

    updateReplayReliability(
        snapshot: SincroPoseMotionSnapshot,
        previousPose: SincroPoseMotionSnapshot,
        frameReliability: unknown,
        mediaTimeMs: number,
        video: { width: number; height: number },
    ): void {
        if (frameReliability !== undefined) {
            const parsed = parseReliabilityMap(frameReliability);
            this.latestReliability = parsed.ok
                ? parsed.map
                : {
                      parseStatus: "invalid",
                      errors: parsed.errors,
                      raw: frameReliability,
                  };
            return;
        }

        const previousReliability = this.latestValidReliability();
        this.latestReliability = createPoseReliabilityMap({
            pose: snapshot,
            previous:
                previousReliability === undefined
                    ? undefined
                    : {
                          pose: previousPose,
                          mediaTimeMs: previousReliability.timestamp.mediaTimeMs,
                          reliability: previousReliability,
                      },
            mediaTimeMs,
            video,
        });
    }

    latestValidReliability(): ReliabilityMap | undefined {
        const reliability = this.latestReliability;
        if (reliability === undefined || "parseStatus" in reliability) {
            return undefined;
        }
        return reliability;
    }

    setReliabilityState(state: ReliabilityMap | undefined): void {
        this.latestReliability = state;
    }

    resetReliabilityState(): void {
        this.latestReliability = undefined;
    }

    snapshotState(): Pick<MotionDebugSnapshot, "pose" | "hand" | "reliability" | "tracker"> & {
        face: SincroFaceMotionSnapshot;
    } {
        return {
            face: this.latestFaceSnapshot,
            hand: this.latestHandSnapshot,
            pose: this.latestPoseSnapshot,
            reliability: this.latestReliability,
            tracker: this.latestTrackerStats,
        };
    }

    private handleFaceMotion(
        snapshot: SincroFaceMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        this.params.camera.updateFrameTiming(timing);
        this.latestFaceSnapshot = snapshot;
        this.params.behaviorState.applyFaceMotion(snapshot);
        this.params.debugConsole.updateSincroFaceMotion(snapshot);
    }

    private handleHandMotion(
        snapshot: SincroHandMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        this.params.camera.updateFrameTiming(timing);
        this.latestHandSnapshot = snapshot;
    }

    private handlePoseMotion(
        snapshot: SincroPoseMotionSnapshot,
        timing: TrackerVideoFrameTiming | undefined,
        renderOverlay: boolean,
    ): void {
        const previousPose = this.setPoseSnapshot(snapshot);
        this.params.camera.updateFrameTiming(timing);
        this.params.camera.updateCameraQuality(snapshot, timing);
        this.updateLiveReliability(snapshot, previousPose, timing);
        this.params.behaviorState.applyPoseMotion(snapshot);
        this.params.debugConsole.updateSincroPoseMotion(snapshot);
        this.recordPoseFrame(snapshot, timing);
        if (renderOverlay) {
            this.params.overlayRenderer.render(snapshot, this.params.video);
        }
    }

    private recordPoseFrame(
        snapshot: SincroPoseMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        const mediaTimeMs = timing?.mediaTimeMs ?? snapshot.lastUpdatedAtMs;
        const raw =
            mediaTimeMs !== undefined && this.latestMediaPipeRaw?.timing.mediaTimeMs === mediaTimeMs
                ? this.latestMediaPipeRaw
                : undefined;
        const result = this.params.recording.recordPoseFrame(
            snapshot,
            timing,
            this.params.camera.getCameraQuality(),
            this.latestValidReliability(),
            undefined,
            raw,
        );
        if (result !== undefined && !result.ok) {
            frontendLogger.warn("Motion debug frame was not recorded.", {
                code: result.code,
                message: result.message,
            });
        }
    }

    private handleMediaPipeRawResult(
        result: TrackerRuntimeMediaPipeRawResult,
        timing?: TrackerVideoFrameTiming,
    ): void {
        const mediaTimeMs = timing?.mediaTimeMs ?? result.timing.mediaTimeMs;
        if (mediaTimeMs !== result.timing.mediaTimeMs) {
            return;
        }
        this.latestMediaPipeRaw = result;
    }
}
