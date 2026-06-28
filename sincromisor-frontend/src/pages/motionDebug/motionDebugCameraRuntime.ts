/**
 * motion-debug の camera / video fixture source と TrackerRuntime start / stop を管理する lifecycle owner。
 * source reset 時に temporal / intent estimator を caller 経由で reset できるよう、MediaStream cleanup と state publish をここに閉じる。
 */
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    type CameraQualityPoseSample,
    type CameraQualityScore,
    createCameraQualityScore,
} from "../../features/gaze/trackingRuntime/cameraQualityScore";
import {
    resolveTrackerRuntimePerformanceProfile,
    type TrackerRuntimePerformanceProfile,
} from "../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import { requestMotionDebugCameraStream } from "./motionDebugCameraStream";
import { createFixtureVideoStream } from "./motionDebugVideoSource";
import type { MotionDebugCameraState, MotionDebugStartCameraOptions } from "./types";

const CAMERA_QUALITY_TIMING_HISTORY_LIMIT = 30;
const CAMERA_QUALITY_POSE_SAMPLE_LIMIT = 10;

export type MotionDebugCameraRuntimeStart = {
    stream: MediaStream;
    source: Exclude<MotionDebugCameraState["source"], "none">;
    performanceProfile: TrackerRuntimePerformanceProfile;
};

export class MotionDebugCameraRuntime {
    private activeStream?: MediaStream;
    private activeFixtureVideo?: HTMLVideoElement;
    private activeFixtureUrl?: string;
    private source: MotionDebugCameraState["source"] = "none";
    private activePerformanceProfile = resolveTrackerRuntimePerformanceProfile({
        defaultProfileId: "debug",
    }).profile;
    private latestFrameTiming?: TrackerVideoFrameTiming;
    private latestCameraQuality?: CameraQualityScore;
    private frameTimingHistory: TrackerVideoFrameTiming[] = [];
    private poseQualitySamples: CameraQualityPoseSample[] = [];

    constructor(private readonly video: HTMLVideoElement) {}

    async requestCamera(
        options?: MotionDebugStartCameraOptions,
    ): Promise<MotionDebugCameraRuntimeStart> {
        this.activeFixtureUrl = undefined;
        const performanceProfile = resolveTrackerRuntimePerformanceProfile({
            performanceProfileId: options?.performanceProfileId,
            performanceProfile: options?.performanceProfile,
            defaultProfileId: "debug",
        }).profile;
        const stream = await requestMotionDebugCameraStream({
            performanceProfile,
            defaultProfileId: "debug",
        });
        return { stream, source: "camera", performanceProfile };
    }

    async requestFixture(url: string): Promise<MotionDebugCameraRuntimeStart> {
        const { stream, video } = await createFixtureVideoStream(url);
        this.activeFixtureVideo = video;
        this.activeFixtureUrl = url;
        return {
            stream,
            source: "fixture",
            performanceProfile: resolveTrackerRuntimePerformanceProfile({
                defaultProfileId: "debug",
            }).profile,
        };
    }

    activate(input: MotionDebugCameraRuntimeStart): MediaStreamTrack {
        const [track] = input.stream.getVideoTracks();
        if (!track) {
            throw new Error("Video stream does not contain a video track.");
        }
        this.activeStream = input.stream;
        this.source = input.source;
        this.activePerformanceProfile = input.performanceProfile;
        return track;
    }

    stop(): void {
        this.activeStream?.getTracks().forEach((track) => {
            track.stop();
        });
        this.activeFixtureVideo?.pause();
        this.activeFixtureVideo = undefined;
        this.activeFixtureUrl = undefined;
        this.activeStream = undefined;
        this.source = "none";
        this.activePerformanceProfile = resolveTrackerRuntimePerformanceProfile({
            defaultProfileId: "debug",
        }).profile;
        this.latestFrameTiming = undefined;
        this.latestCameraQuality = undefined;
        this.frameTimingHistory = [];
        this.poseQualitySamples = [];
    }

    updateFrameTiming(timing?: TrackerVideoFrameTiming): void {
        this.latestFrameTiming = timing;
    }

    updateCameraQuality(
        snapshot: SincroPoseMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        if (timing !== undefined) {
            this.frameTimingHistory = [...this.frameTimingHistory, timing].slice(
                -CAMERA_QUALITY_TIMING_HISTORY_LIMIT,
            );
        }
        this.poseQualitySamples = [
            ...this.poseQualitySamples,
            {
                poseDetected: snapshot.detected,
                poseConfidence: snapshot.confidence,
            },
        ].slice(-CAMERA_QUALITY_POSE_SAMPLE_LIMIT);

        const [track] = this.activeStream?.getVideoTracks() ?? [];
        if (this.source === "none") {
            this.latestCameraQuality = undefined;
            return;
        }
        this.latestCameraQuality = createCameraQualityScore({
            source: this.source,
            trackSettings: track?.getSettings(),
            trackReadyState: track?.readyState,
            videoWidth: this.video.videoWidth,
            videoHeight: this.video.videoHeight,
            pose: snapshot,
            timing,
            timingHistory: this.frameTimingHistory,
            poseSamples: this.poseQualitySamples,
        });
    }

    state(): MotionDebugCameraState {
        return {
            source: this.source,
            width: this.video.videoWidth,
            height: this.video.videoHeight,
            readyState: this.video.readyState,
            performanceProfile: this.currentPerformanceProfile(),
            frameTiming: this.latestFrameTiming,
            quality: this.latestCameraQuality,
        };
    }

    getActiveStream(): MediaStream | undefined {
        return this.activeStream;
    }

    getActiveFixtureUrl(): string | undefined {
        return this.activeFixtureUrl;
    }

    getCameraSource(): MotionDebugCameraState["source"] {
        return this.source;
    }

    getCameraQuality(): CameraQualityScore | undefined {
        return this.latestCameraQuality;
    }

    currentPerformanceProfile(): TrackerRuntimePerformanceProfile {
        return resolveTrackerRuntimePerformanceProfile({
            performanceProfile: this.activePerformanceProfile,
        }).profile;
    }
}
