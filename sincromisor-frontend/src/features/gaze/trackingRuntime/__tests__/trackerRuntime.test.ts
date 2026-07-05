import { afterEach, describe, expect, it, vi } from "vitest";

import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "../../faceTracking/sincroFaceMotionSnapshot";
import { SincroFaceTracker } from "../../faceTracking/sincroFaceTracker";
import {
    createSincroGestureFallbackSnapshot,
    type SincroGestureMotionSnapshot,
} from "../../gestureTracking/sincroGestureMotionSnapshot";
import { SincroGestureTracker } from "../../gestureTracking/sincroGestureTracker";
import {
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandMotionSnapshot,
} from "../../handTracking/sincroHandMotionSnapshot";
import { SincroHandTracker } from "../../handTracking/sincroHandTracker";
import {
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../poseTracking/sincroPoseMotionSnapshotClone";
import { SincroPoseTracker } from "../../poseTracking/sincroPoseTracker";
import type { SincroRoiObservation } from "../roiTracking/roiTrackingTypes";
import { SincroTrackerWorkerClient } from "../sincroTrackerWorkerClient";
import type { SincroTrackerWorkerStats } from "../sincroTrackerWorkerTypes";
import { TrackerRuntime } from "../trackerRuntime";
import { resolveTrackerRuntimePerformanceProfile } from "../trackerRuntimePerformanceProfile";
import type { TrackerRuntimeCallbacks } from "../trackerRuntimeTypes";
import { runTrackerRuntimeWorkerPipeline } from "../trackerRuntimeWorkerPipeline";

class RecordingFaceTracker extends SincroFaceTracker {
    readonly fullFrameTimestamps: number[] = [];
    readonly roiTimestamps: number[] = [];

    override async initVision(): Promise<void> {}

    override detect(videoFrame: TexImageSource, timestampMs: number): SincroFaceMotionSnapshot {
        void videoFrame;
        this.fullFrameTimestamps.push(timestampMs);
        return createFaceSnapshot({
            timestampMs,
            source: "full-frame",
        });
    }

    override detectWithRoi(
        videoFrame: TexImageSource,
        poseSnapshot: SincroPoseMotionSnapshot,
        timestampMs: number,
    ): SincroFaceMotionSnapshot {
        void videoFrame;
        void poseSnapshot;
        this.roiTimestamps.push(timestampMs);
        return createFaceSnapshot({
            timestampMs,
            source: "roi",
            roi: createFaceRoi(),
            inferenceTimeMs: 4,
        });
    }
}

class FreshPoseTracker extends SincroPoseTracker {
    readonly timestamps: number[] = [];
    inferenceTimeMs = 1;

    override async initVision(): Promise<void> {}

    override detect(videoFrame: TexImageSource, timestampMs: number): SincroPoseMotionSnapshot {
        void videoFrame;
        this.timestamps.push(timestampMs);
        return createFreshPose(timestampMs, this.inferenceTimeMs);
    }
}

class SequencedPoseTracker extends FreshPoseTracker {
    private readonly inferenceTimesMs: number[];

    constructor(inferenceTimesMs: number[]) {
        super();
        this.inferenceTimesMs = inferenceTimesMs;
    }

    override detect(videoFrame: TexImageSource, timestampMs: number): SincroPoseMotionSnapshot {
        this.inferenceTimeMs = this.inferenceTimesMs.shift() ?? 1;
        return super.detect(videoFrame, timestampMs);
    }
}

class NoopHandTracker extends SincroHandTracker {
    override async initVision(): Promise<void> {}
}

class RecordingHandTracker extends SincroHandTracker {
    readonly timestamps: number[] = [];

    override async initVision(): Promise<void> {}

    override detect(
        videoFrame: TexImageSource,
        poseSnapshot: SincroPoseMotionSnapshot,
        timestampMs: number,
    ): SincroHandMotionSnapshot {
        void videoFrame;
        void poseSnapshot;
        this.timestamps.push(timestampMs);
        return {
            ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
            trackingEnabled: true,
            detected: true,
            inferenceTimeMs: 1,
            inferenceFps: 4,
            lastUpdatedAtMs: timestampMs,
        };
    }
}

class FailingInitHandTracker extends SincroHandTracker {
    override async initVision(): Promise<void> {
        throw new Error("hand init failed");
    }
}

class FailingInitGestureTracker extends SincroGestureTracker {
    override async initVision(): Promise<void> {
        throw new Error("gesture init failed");
    }
}

class ThrowingGestureTracker extends SincroGestureTracker {
    override async initVision(): Promise<void> {}

    override detect(
        videoFrame: TexImageSource,
        handSnapshot: SincroHandMotionSnapshot,
        timestampMs: number,
    ): SincroGestureMotionSnapshot {
        void videoFrame;
        void handSnapshot;
        return createSincroGestureFallbackSnapshot({
            reason: "gesture inference failed",
            nowMs: timestampMs,
            warnings: ["inference_failed"],
        });
    }
}

type FakeVideo = {
    video: HTMLVideoElement;
    getFrameCallback: () => VideoFrameRequestCallback | undefined;
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("TrackerRuntime", () => {
    it("keeps full-frame Face detect when fresh Pose makes Face ROI due", async () => {
        vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
        vi.stubGlobal("MediaStream", FakeMediaStream);
        const { video, getFrameCallback } = createFakeVideo();
        const faceTracker = new RecordingFaceTracker();
        const poseTracker = new FreshPoseTracker();
        const runtime = new TrackerRuntime(video, faceTracker, poseTracker, new NoopHandTracker());
        const faceSnapshots: SincroFaceMotionSnapshot[] = [];
        const callbacks: TrackerRuntimeCallbacks = {
            onFaceMotion: (snapshot) => {
                faceSnapshots.push(snapshot);
            },
        };

        await runtime.startFaceTracking(createFakeTrack(), callbacks, 15, {
            enabled: true,
            targetInferenceFps: 12,
            faceRoi: {
                enabled: true,
                targetInferenceFps: 6,
            },
        });
        getFrameCallback()?.(1000, createVideoFrameMetadata(1, 1));

        expect(poseTracker.timestamps).toEqual([1000]);
        expect(faceTracker.fullFrameTimestamps).toEqual([1000]);
        expect(faceTracker.roiTimestamps).toEqual([1000]);
        expect(faceSnapshots[0]?.source).toBe("full-frame");
        expect(faceSnapshots[0]?.roi?.source).toBe("pose-face");
        runtime.stopFaceTracking("test_done");
    });

    it("resumes Pose, Face ROI, and Hand after policy face-only and comfortable-idle recovery", async () => {
        vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
        vi.stubGlobal("MediaStream", FakeMediaStream);
        const { video, getFrameCallback } = createFakeVideo();
        const faceTracker = new RecordingFaceTracker();
        const poseTracker = new SequencedPoseTracker([
            2000, 2000, 2000, 2000, 2000, 2000, 1, 1, 1, 1, 1, 1,
        ]);
        const handTracker = new RecordingHandTracker();
        const runtime = new TrackerRuntime(video, faceTracker, poseTracker, handTracker);
        const poseSnapshots: SincroPoseMotionSnapshot[] = [];
        const stats: SincroTrackerWorkerStats[] = [];
        const callbacks: TrackerRuntimeCallbacks = {
            onFaceMotion: () => {},
            onPoseMotion: (snapshot) => {
                poseSnapshots.push(snapshot);
            },
            onTrackerStats: (snapshot) => {
                stats.push(snapshot);
            },
        };

        await runtime.startFaceTracking(createFakeTrack(), callbacks, 15, {
            enabled: true,
            targetInferenceFps: 12,
            hand: { enabled: true, targetInferenceFps: 8 },
            faceRoi: { enabled: true, targetInferenceFps: 10 },
            performanceProfile: createFastRecoveryProfile(),
        });
        for (let frame = 1; frame <= 12; frame += 1) {
            getFrameCallback()?.(frame * 1000, createVideoFrameMetadata(frame, frame));
        }

        const stages = stats.map((snapshot) => snapshot.degradationPolicy?.stage);
        const comfortableIdleIndex = stages.indexOf("comfortable-idle");
        const recoveredPoseIndex = stages.indexOf("pose-reduced-fps", comfortableIdleIndex);
        expect(stages).toContain("face-only");
        expect(comfortableIdleIndex).toBeGreaterThan(-1);
        expect(recoveredPoseIndex).toBeGreaterThan(comfortableIdleIndex);
        expect(poseTracker.timestamps).toContain(8000);
        expect(poseSnapshots.some((snapshot) => snapshot.degradedToFaceOnly)).toBe(true);
        expect(poseSnapshots[poseSnapshots.length - 1]).toMatchObject({
            detected: true,
            degradedToFaceOnly: false,
        });
        expect(faceTracker.roiTimestamps.some((timestamp) => timestamp >= 9000)).toBe(true);
        expect(handTracker.timestamps.some((timestamp) => timestamp >= 11000)).toBe(true);
        runtime.stopFaceTracking("test_done");
    });

    it("publishes a lost hand snapshot when Hand initialization fails without stopping Face and Pose", async () => {
        vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
        vi.stubGlobal("MediaStream", FakeMediaStream);
        const { video, getFrameCallback } = createFakeVideo();
        const faceTracker = new RecordingFaceTracker();
        const poseTracker = new FreshPoseTracker();
        const handTracker = new FailingInitHandTracker();
        const runtime = new TrackerRuntime(video, faceTracker, poseTracker, handTracker);
        const faceSnapshots: SincroFaceMotionSnapshot[] = [];
        const poseSnapshots: SincroPoseMotionSnapshot[] = [];
        const handSnapshots: SincroHandMotionSnapshot[] = [];

        await runtime.startFaceTracking(
            createFakeTrack(),
            {
                onFaceMotion: (snapshot) => {
                    faceSnapshots.push(snapshot);
                },
                onPoseMotion: (snapshot) => {
                    poseSnapshots.push(snapshot);
                },
                onHandMotion: (snapshot) => {
                    handSnapshots.push(snapshot);
                },
            },
            15,
            {
                enabled: true,
                targetInferenceFps: 12,
                hand: { enabled: true, targetInferenceFps: 8 },
            },
        );
        getFrameCallback()?.(1000, createVideoFrameMetadata(1, 1));

        expect(handSnapshots.some((snapshot) => snapshot.detected === false)).toBe(true);
        expect(
            handSnapshots.some(
                (snapshot) =>
                    snapshot.fallbackReason === "hand init failed" &&
                    snapshot.leftHand.warnings.includes("model_not_loaded"),
            ),
        ).toBe(true);
        expect(faceSnapshots.some((snapshot) => snapshot.detected)).toBe(true);
        expect(poseSnapshots.some((snapshot) => snapshot.detected)).toBe(true);
        runtime.stopFaceTracking("test_done");
    });

    it("publishes a lost gesture snapshot when Gesture initialization fails without stopping Face, Pose, and Hand", async () => {
        vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
        vi.stubGlobal("MediaStream", FakeMediaStream);
        const { video, getFrameCallback } = createFakeVideo();
        const faceTracker = new RecordingFaceTracker();
        const poseTracker = new FreshPoseTracker();
        const handTracker = new RecordingHandTracker();
        const gestureTracker = new FailingInitGestureTracker();
        const runtime = new TrackerRuntime(
            video,
            faceTracker,
            poseTracker,
            handTracker,
            gestureTracker,
        );
        const faceSnapshots: SincroFaceMotionSnapshot[] = [];
        const poseSnapshots: SincroPoseMotionSnapshot[] = [];
        const handSnapshots: SincroHandMotionSnapshot[] = [];
        const gestureSnapshots: SincroGestureMotionSnapshot[] = [];

        await runtime.startFaceTracking(
            createFakeTrack(),
            {
                onFaceMotion: (snapshot) => {
                    faceSnapshots.push(snapshot);
                },
                onPoseMotion: (snapshot) => {
                    poseSnapshots.push(snapshot);
                },
                onHandMotion: (snapshot) => {
                    handSnapshots.push(snapshot);
                },
                onGestureMotion: (snapshot) => {
                    gestureSnapshots.push(snapshot);
                },
            },
            15,
            {
                enabled: true,
                targetInferenceFps: 12,
                hand: { enabled: true, targetInferenceFps: 8 },
                gesture: { enabled: true, targetInferenceFps: 6 },
            },
        );
        getFrameCallback()?.(1000, createVideoFrameMetadata(1, 1));

        expect(
            gestureSnapshots.some(
                (snapshot) =>
                    snapshot.fallbackReason === "gesture init failed" &&
                    snapshot.left?.warnings.includes("model_not_loaded"),
            ),
        ).toBe(true);
        expect(faceSnapshots.some((snapshot) => snapshot.detected)).toBe(true);
        expect(poseSnapshots.some((snapshot) => snapshot.detected)).toBe(true);
        expect(handSnapshots.some((snapshot) => snapshot.detected)).toBe(true);
        runtime.stopFaceTracking("test_done");
    });

    it("keeps main-thread tracking alive when Gesture inference returns a lost snapshot", async () => {
        vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
        vi.stubGlobal("MediaStream", FakeMediaStream);
        const { video, getFrameCallback } = createFakeVideo();
        const faceTracker = new RecordingFaceTracker();
        const poseTracker = new FreshPoseTracker();
        const handTracker = new RecordingHandTracker();
        const gestureTracker = new ThrowingGestureTracker();
        const runtime = new TrackerRuntime(
            video,
            faceTracker,
            poseTracker,
            handTracker,
            gestureTracker,
        );
        const gestureSnapshots: SincroGestureMotionSnapshot[] = [];
        const faceSnapshots: SincroFaceMotionSnapshot[] = [];

        await runtime.startFaceTracking(
            createFakeTrack(),
            {
                onFaceMotion: (snapshot) => {
                    faceSnapshots.push(snapshot);
                },
                onGestureMotion: (snapshot) => {
                    gestureSnapshots.push(snapshot);
                },
            },
            15,
            {
                enabled: true,
                targetInferenceFps: 12,
                hand: { enabled: true, targetInferenceFps: 8 },
                gesture: { enabled: true, targetInferenceFps: 6 },
            },
        );
        getFrameCallback()?.(1000, createVideoFrameMetadata(1, 1));

        expect(gestureSnapshots[0]).toMatchObject({
            source: "lost",
            fallbackReason: "gesture inference failed",
            warnings: ["gesture_skipped", "inference_failed"],
        });
        expect(faceSnapshots.some((snapshot) => snapshot.detected)).toBe(true);
        runtime.stopFaceTracking("test_done");
    });

    it("publishes worker lost gesture snapshots without switching to main-thread fallback", async () => {
        const { video } = createFakeVideo();
        const workerClient = new SincroTrackerWorkerClient();
        const imageBitmap = createFakeImageBitmap();
        const gestureSnapshots: SincroGestureMotionSnapshot[] = [];
        let scheduled = false;
        let fallbackCalled = false;
        vi.stubGlobal("createImageBitmap", async () => imageBitmap);
        vi.spyOn(workerClient, "detect").mockResolvedValue({
            face: createFaceSnapshot({ timestampMs: 1000, source: "full-frame" }),
            pose: createFreshPose(1000),
            hand: createDetectedHandSnapshot(1000),
            gesture: createSincroGestureFallbackSnapshot({
                reason: "gesture init failed",
                nowMs: 1000,
                warnings: ["model_not_loaded"],
            }),
            stats: workerClient.getStats(),
        });

        await runTrackerRuntimeWorkerPipeline({
            videoElement: video,
            callbacks: {
                onFaceMotion: () => {},
                onGestureMotion: (snapshot) => {
                    gestureSnapshots.push(snapshot);
                },
            },
            workerClient,
            timing: {
                source: "request-video-frame-callback",
                receivedAtPerformanceMs: 1000,
                mediaTimeMs: 1000,
                videoCurrentTimeMs: 1000,
                droppedPresentedFrames: 0,
            },
            plan: {
                runFace: true,
                runPose: true,
                hasFreshPoseForOptionalPass: true,
                runHand: true,
                runGesture: true,
                runFaceRoi: false,
            },
            handTrackingEnabled: true,
            gestureTrackingRequested: true,
            gestureTrackingEnabled: true,
            faceRoiTrackingEnabled: false,
            handRoiPaused: false,
            faceRoiPaused: false,
            frameLoopIsEnabled: () => true,
            markFrameLoopStopped: () => {},
            scheduleFrame: () => {
                scheduled = true;
            },
            markPoseInference: () => {},
            markHandInference: () => {},
            markGestureInference: () => {},
            markFaceRoiInference: () => {},
            setLatestPoseSnapshot: () => {},
            applyPosePerformanceGate: () => {},
            recordRoiFrame: () => ({
                pauseState: "active",
                fallbackCount: 0,
                skippedFrames: 0,
                consecutiveOverBudgetFrames: 0,
                reasonCodes: [],
            }),
            withBudget: (input) => input.stats,
            switchToMainThreadFallback: async () => {
                fallbackCalled = true;
            },
        });

        expect(gestureSnapshots[0]).toMatchObject({
            source: "lost",
            fallbackReason: "gesture init failed",
            warnings: ["gesture_skipped", "model_not_loaded"],
        });
        expect(fallbackCalled).toBe(false);
        expect(scheduled).toBe(true);
    });
});

class FakeMediaStream {
    addTrack(_track: MediaStreamTrack): void {}
}

function createFakeTrack(): MediaStreamTrack {
    return Object.create(null);
}

function createFakeVideo(): FakeVideo {
    let frameCallback: VideoFrameRequestCallback | undefined;
    const video: HTMLVideoElement = Object.create(null);
    Object.defineProperty(video, "readyState", {
        configurable: true,
        value: 2,
    });
    Object.defineProperty(video, "videoWidth", {
        configurable: true,
        value: 640,
    });
    Object.defineProperty(video, "videoHeight", {
        configurable: true,
        value: 480,
    });
    Object.defineProperty(video, "currentTime", {
        configurable: true,
        value: 1,
    });
    Object.defineProperty(video, "setAttribute", {
        configurable: true,
        value: () => {},
    });
    Object.defineProperty(video, "addEventListener", {
        configurable: true,
        value: () => {},
    });
    Object.defineProperty(video, "pause", {
        configurable: true,
        value: () => {},
    });
    Object.defineProperty(video, "requestVideoFrameCallback", {
        configurable: true,
        value: (callback: VideoFrameRequestCallback) => {
            frameCallback = callback;
            return 1;
        },
    });
    Object.defineProperty(video, "cancelVideoFrameCallback", {
        configurable: true,
        value: () => {},
    });
    return {
        video,
        getFrameCallback: () => frameCallback,
    };
}

function createVideoFrameMetadata(
    mediaTime: number,
    presentedFrames: number,
): VideoFrameCallbackMetadata {
    return {
        expectedDisplayTime: 1000,
        height: 480,
        mediaTime,
        presentationTime: 1000,
        presentedFrames,
        width: 640,
    };
}

function createFaceSnapshot(input: {
    timestampMs: number;
    source: SincroFaceMotionSnapshot["source"];
    roi?: SincroRoiObservation;
    inferenceTimeMs?: number;
}): SincroFaceMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.8,
        source: input.source,
        roi: input.roi,
        warnings: [],
        inferenceTimeMs: input.inferenceTimeMs ?? 2,
        inferenceFps: 15,
        lastUpdatedAtMs: input.timestampMs,
    };
}

function createFreshPose(timestampMs: number, inferenceTimeMs = 1): SincroPoseMotionSnapshot {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.9,
        inferenceTimeMs,
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            shoulderWidth: 0.2,
            shoulderCenterX: 0.5,
            shoulderCenterY: 0.4,
        },
        lastUpdatedAtMs: timestampMs,
    });
}

function createFaceRoi(): SincroRoiObservation {
    return {
        side: "face",
        source: "pose-face",
        rect: {
            centerX: 0.5,
            centerY: 0.22,
            width: 0.29,
            height: 0.29,
            clamped: false,
        },
        confidence: 0.9,
        referencePoint: [0.5, 0.22],
        warnings: [],
    };
}

function createDetectedHandSnapshot(timestampMs: number): SincroHandMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        inferenceTimeMs: 1,
        inferenceFps: 4,
        lastUpdatedAtMs: timestampMs,
    };
}

function createFakeImageBitmap(): ImageBitmap {
    const imageBitmap: ImageBitmap = Object.create(null);
    Object.defineProperty(imageBitmap, "close", {
        configurable: true,
        value: () => {},
    });
    return imageBitmap;
}

function createFastRecoveryProfile(): ReturnType<
    typeof resolveTrackerRuntimePerformanceProfile
>["profile"] {
    const base = resolveTrackerRuntimePerformanceProfile({
        performanceProfileId: "high-end-desktop",
    }).profile;
    return {
        ...base,
        degradationBudget: {
            ...base.degradationBudget,
            consecutiveOverBudgetFrames: 1,
            recoveryFrames: 1,
        },
    };
}
