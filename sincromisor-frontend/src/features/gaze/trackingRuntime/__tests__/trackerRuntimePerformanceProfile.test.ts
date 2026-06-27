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
import { SincroPoseTracker } from "../../poseTracking/sincroPoseTracker";
import type { SincroTrackerWorkerStats } from "../sincroTrackerWorkerTypes";
import { TrackerRuntime } from "../trackerRuntime";
import {
    resolveTrackerRuntimePerformanceProfile,
    TRACKER_RUNTIME_PERFORMANCE_PROFILE_SCHEMA_VERSION,
    type TrackerRuntimePerformanceProfileId,
} from "../trackerRuntimePerformanceProfile";
import type { TrackerRuntimeCallbacks } from "../trackerRuntimeTypes";

class RecordingFaceTracker extends SincroFaceTracker {
    override async initVision(): Promise<void> {}

    override detect(videoFrame: TexImageSource, timestampMs: number): SincroFaceMotionSnapshot {
        void videoFrame;
        return {
            ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
            trackingEnabled: true,
            detected: true,
            confidence: 0.9,
            inferenceFps: 15,
            lastUpdatedAtMs: timestampMs,
        };
    }
}

class RecordingPoseTracker extends SincroPoseTracker {
    override async initVision(): Promise<void> {}

    override detect(videoFrame: TexImageSource, timestampMs: number): SincroPoseMotionSnapshot {
        void videoFrame;
        return {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
            trackingEnabled: true,
            detected: true,
            confidence: 0.9,
            inferenceFps: 12,
            lastUpdatedAtMs: timestampMs,
        };
    }
}

class NoopHandTracker extends SincroHandTracker {
    override async initVision(): Promise<void> {}
}

type FakeVideo = {
    video: HTMLVideoElement;
    getFrameCallback: () => VideoFrameRequestCallback | undefined;
};

const EXPECTED_PROFILES: Record<
    TrackerRuntimePerformanceProfileId,
    {
        camera: [number, number, number];
        cadence: [number, number, number, number, number];
        numericRingBufferFrames: number;
    }
> = {
    "high-end-desktop": {
        camera: [1280, 720, 30],
        cadence: [15, 12, 8, 10, 6],
        numericRingBufferFrames: 600,
    },
    "standard-laptop": {
        camera: [960, 540, 24],
        cadence: [12, 8, 4, 6, 3],
        numericRingBufferFrames: 600,
    },
    "mobile-safari": {
        camera: [640, 480, 15],
        cadence: [8, 4, 2, 3, 1],
        numericRingBufferFrames: 600,
    },
    debug: {
        camera: [1280, 720, 30],
        cadence: [15, 12, 4, 6, 2],
        numericRingBufferFrames: 1800,
    },
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("resolveTrackerRuntimePerformanceProfile", () => {
    for (const [id, expected] of Object.entries(EXPECTED_PROFILES)) {
        it(`resolves fixed values for ${id}`, () => {
            const result = resolveTrackerRuntimePerformanceProfile({ performanceProfileId: id });

            expect(result.source).toBe("id");
            expect(result.profile).toMatchObject({
                schemaVersion: TRACKER_RUNTIME_PERFORMANCE_PROFILE_SCHEMA_VERSION,
                id,
                requestedId: id,
                camera: {
                    idealWidth: expected.camera[0],
                    idealHeight: expected.camera[1],
                    idealFrameRate: expected.camera[2],
                    maxFrameRate: expected.camera[2],
                    facingMode: "user",
                },
                cadence: {
                    faceFps: expected.cadence[0],
                    poseFps: expected.cadence[1],
                    handFps: expected.cadence[2],
                    faceRoiFps: expected.cadence[3],
                    gestureFps: expected.cadence[4],
                },
                debugLog: {
                    numericRingBufferFrames: expected.numericRingBufferFrames,
                    captureFullDumpByDefault: false,
                    overlayCaptureFps: 1,
                },
                degradationBudget: {
                    workerRoundTripWarnRatio: 0.9,
                    workerRoundTripOverBudgetRatio: 1.25,
                    roiBudgetRatio: 0.55,
                    consecutiveOverBudgetFrames: 5,
                    recoveryFrames: 30,
                },
                warnings: [],
            });
        });
    }

    it("defaults to standard laptop when no profile is specified", () => {
        const result = resolveTrackerRuntimePerformanceProfile();

        expect(result.source).toBe("default");
        expect(result.profile.id).toBe("standard-laptop");
    });

    it("falls back to standard laptop for unknown ids", () => {
        const result = resolveTrackerRuntimePerformanceProfile({
            performanceProfileId: "unknown-phone",
            defaultProfileId: "debug",
        });

        expect(result.source).toBe("fallback");
        expect(result.profile).toMatchObject({
            id: "standard-laptop",
            requestedId: "unknown-phone",
            warnings: ["unknown_profile_id_defaulted"],
        });
    });

    it("rejects non-finite custom profiles and falls back to standard laptop", () => {
        const baseProfile = resolveTrackerRuntimePerformanceProfile({
            performanceProfileId: "debug",
        }).profile;
        const invalidProfile = {
            ...baseProfile,
            cadence: {
                ...baseProfile.cadence,
                poseFps: Number.POSITIVE_INFINITY,
            },
        };

        const result = resolveTrackerRuntimePerformanceProfile({
            performanceProfileId: "custom-debug",
            performanceProfile: invalidProfile,
        });

        expect(result.source).toBe("fallback");
        expect(result.profile).toMatchObject({
            id: "standard-laptop",
            requestedId: "custom-debug",
            warnings: ["invalid_custom_profile_defaulted"],
        });
    });
});

describe("TrackerRuntime performance profile cadence", () => {
    it("keeps explicit face and pose target fps ahead of profile cadence", async () => {
        vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
        vi.stubGlobal("MediaStream", FakeMediaStream);
        const { video, getFrameCallback } = createFakeVideo();
        const runtime = new TrackerRuntime(
            video,
            new RecordingFaceTracker(),
            new RecordingPoseTracker(),
            new NoopHandTracker(),
        );
        const stats: SincroTrackerWorkerStats[] = [];
        const callbacks: TrackerRuntimeCallbacks = {
            onFaceMotion: () => {},
            onTrackerStats: (snapshot) => {
                stats.push(snapshot);
            },
        };

        await runtime.startFaceTracking(createFakeTrack(), callbacks, 7, {
            enabled: true,
            targetInferenceFps: 3,
            performanceProfileId: "mobile-safari",
        });
        getFrameCallback()?.(1000, createVideoFrameMetadata(1, 1));

        expect(stats[stats.length - 1]).toMatchObject({
            effectiveFaceFps: 7,
            effectivePoseFps: 3,
        });
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
    Object.defineProperties(video, {
        readyState: {
            configurable: true,
            value: 2,
        },
        videoWidth: {
            configurable: true,
            value: 640,
        },
        videoHeight: {
            configurable: true,
            value: 480,
        },
        currentTime: {
            configurable: true,
            value: 1,
        },
        setAttribute: {
            configurable: true,
            value: () => {},
        },
        addEventListener: {
            configurable: true,
            value: () => {},
        },
        pause: {
            configurable: true,
            value: () => {},
        },
        requestVideoFrameCallback: {
            configurable: true,
            value: (callback: VideoFrameRequestCallback) => {
                frameCallback = callback;
                return 1;
            },
        },
        cancelVideoFrameCallback: {
            configurable: true,
            value: () => {},
        },
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
