import { afterEach, describe, expect, it, vi } from "vitest";

import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "../../faceTracking/sincroFaceMotionSnapshot";
import { SincroFaceTracker } from "../../faceTracking/sincroFaceTracker";
import { SincroHandTracker } from "../../handTracking/sincroHandTracker";
import {
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../poseTracking/sincroPoseMotionSnapshotClone";
import { SincroPoseTracker } from "../../poseTracking/sincroPoseTracker";
import type { SincroRoiObservation } from "../roiTracking/roiTrackingTypes";
import { TrackerRuntime } from "../trackerRuntime";
import type { TrackerRuntimeCallbacks } from "../trackerRuntimeTypes";

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

    override async initVision(): Promise<void> {}

    override detect(videoFrame: TexImageSource, timestampMs: number): SincroPoseMotionSnapshot {
        void videoFrame;
        this.timestamps.push(timestampMs);
        return createFreshPose(timestampMs);
    }
}

class NoopHandTracker extends SincroHandTracker {
    override async initVision(): Promise<void> {}
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

function createFreshPose(timestampMs: number): SincroPoseMotionSnapshot {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.9,
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
