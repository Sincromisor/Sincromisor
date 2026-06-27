import { describe, expect, it } from "vitest";
import type { MotionIntentState } from "../../../character/motionIntent/motionIntentState";
import { createDefaultReliabilityMap } from "../../../character/reliability/reliabilityMap";
import {
    createDefaultTemporalUpperBodyState,
    type TemporalUpperBodyState,
} from "../../../character/temporal/temporalUpperBodyState";
import { createDefaultSnapshot } from "../../../features/debug/model/debugConsoleSnapshot";
import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "../../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import {
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandMotionSnapshot,
} from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";
import type { TrackerVideoFrameTiming } from "../../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import { MotionDebugRecordingController } from "../motionDebugRecordingController";

type ResetScenario = {
    name: string;
    reset: (controller: MotionDebugRecordingController) => void;
};

type ControllerHarness = {
    controller: MotionDebugRecordingController;
    getLatestIntent: () => MotionIntentState | undefined;
};

const RESET_SCENARIOS: ResetScenario[] = [
    {
        name: "source reset / camera stop and fixture load",
        reset: (controller) => {
            controller.resetCanonicalState();
            controller.resetReliabilityState();
            controller.resetTemporalState();
        },
    },
    {
        name: "recording load",
        reset: (controller) => {
            controller.resetCanonicalState();
            controller.resetReliabilityState();
            controller.resetTemporalState();
        },
    },
    {
        name: "replay stop",
        reset: (controller) => {
            controller.resetTemporalState();
        },
    },
];

describe("MotionDebugRecordingController intent reset lifecycle", () => {
    for (const scenario of RESET_SCENARIOS) {
        it(`resets MotionIntentEstimator with TemporalStateEstimator for ${scenario.name}`, () => {
            const harness = createControllerHarness();
            const sourceA = createNearFaceTemporal(100);
            harness.controller.recordPoseFrame(
                createPoseSnapshot(100),
                createFrameTiming(100),
                undefined,
                createDefaultReliabilityMap(100),
                sourceA,
            );
            expect(harness.getLatestIntent()?.arms.left.intent).toBe("tracking");

            scenario.reset(harness.controller);
            expect(harness.getLatestIntent()).toBeUndefined();

            const firstSourceB = createNearFaceTemporal(400);
            harness.controller.recordPoseFrame(
                createPoseSnapshot(400),
                createFrameTiming(400),
                undefined,
                createDefaultReliabilityMap(400),
                firstSourceB,
            );

            const intentAfterReset = harness.getLatestIntent();
            expect(intentAfterReset?.arms.left.intent).toBe("tracking");
            expect(intentAfterReset?.arms.left.stableDurationMs).toBe(0);
            expect(intentAfterReset?.warnings).not.toContain("invalid_dt");

            const secondSourceB = createNearFaceTemporal(525);
            harness.controller.recordPoseFrame(
                createPoseSnapshot(525),
                createFrameTiming(525),
                undefined,
                createDefaultReliabilityMap(525),
                secondSourceB,
            );

            expect(harness.getLatestIntent()?.arms.left.intent).toBe("tracking");

            const thirdSourceB = createNearFaceTemporal(650);
            harness.controller.recordPoseFrame(
                createPoseSnapshot(650),
                createFrameTiming(650),
                undefined,
                createDefaultReliabilityMap(650),
                thirdSourceB,
            );

            expect(harness.getLatestIntent()?.arms.left).toMatchObject({
                intent: "nearFace",
                stableDurationMs: 250,
            });
        });
    }

    it("does not carry source-local media time into the next source after reset", () => {
        const harness = createControllerHarness();
        harness.controller.recordPoseFrame(
            createPoseSnapshot(1000),
            createFrameTiming(1000),
            undefined,
            createDefaultReliabilityMap(1000),
            createNearFaceTemporal(1000),
        );
        expect(harness.getLatestIntent()).toBeDefined();

        harness.controller.resetTemporalState();
        expect(harness.getLatestIntent()).toBeUndefined();

        harness.controller.recordPoseFrame(
            createPoseSnapshot(120),
            createFrameTiming(120),
            undefined,
            createDefaultReliabilityMap(120),
            createNearFaceTemporal(120),
        );

        expect(harness.getLatestIntent()?.warnings).not.toContain("invalid_dt");
    });
});

function createControllerHarness(): ControllerHarness {
    let latestIntent: ReturnType<ControllerHarness["getLatestIntent"]>;
    const debugSnapshot = createDefaultSnapshot().sincroMotion;
    const controller = new MotionDebugRecordingController({
        video: createVideoElement(),
        getActiveStream: () => undefined,
        getCameraSource: () => "fixture",
        getActiveFixtureUrl: () => "/fixtures/source-reset.mp4",
        getRetargetConfig: () => ({
            armIkMode: "world_3d_ik",
            armIkStrength: 1,
            armIkTargetScale: 1,
            smoothingMs: 120,
            minConfidence: 0.2,
        }),
        getTrackerStats: () => createTrackerStats(),
        getDebugSnapshot: () => debugSnapshot,
        getFaceSnapshot: () => createFaceSnapshot(),
        getHandSnapshot: () => createHandSnapshot(),
        getAvatarMotionProfile: () => undefined,
        getVrmUrl: () => "/characters/default.vrm",
        poseTargetInferenceFps: 12,
        onCanonicalStateChange: () => {},
        onCanonicalReliabilityInputChange: () => {},
        onReliabilityStateChange: () => {},
        onTemporalStateChange: () => {},
        onIntentStateChange: (state) => {
            latestIntent = state;
        },
        onStateChange: () => {},
    });
    return {
        controller,
        getLatestIntent: () => latestIntent,
    };
}

function createVideoElement(): HTMLVideoElement {
    const video = Object.create(null);
    Object.defineProperties(video, {
        videoWidth: { value: 1280 },
        videoHeight: { value: 720 },
        currentTime: { value: 0 },
    });
    return video;
}

function createFrameTiming(mediaTimeMs: number): TrackerVideoFrameTiming {
    return {
        source: "request-animation-frame",
        receivedAtPerformanceMs: mediaTimeMs,
        mediaTimeMs,
        videoCurrentTimeMs: mediaTimeMs / 1000,
        droppedPresentedFrames: 0,
    };
}

function createTrackerStats(): SincroTrackerWorkerStats {
    return {
        mode: "main-thread",
        status: "running",
        transferTimeMs: 0,
        workerRoundTripMs: 0,
        loadTimeMs: 0,
        droppedFrames: 0,
    };
}

function createPoseSnapshot(mediaTimeMs: number): SincroPoseMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.9,
        lastUpdatedAtMs: mediaTimeMs,
    };
}

function createFaceSnapshot(): SincroFaceMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.8,
    };
}

function createHandSnapshot(): SincroHandMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        leftHand: {
            ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT.leftHand,
            detected: true,
            source: "roi",
            confidence: 0.8,
            handednessScore: 0.9,
            fullFrameWrist: [0.42, 0.24],
            warnings: [],
        },
    };
}

function createNearFaceTemporal(mediaTimeMs: number): TemporalUpperBodyState {
    const temporal = createDefaultTemporalUpperBodyState(mediaTimeMs);
    return {
        ...temporal,
        arms: {
            left: {
                ...temporal.arms.left,
                state: "tracked",
                confidence: 0.9,
                source: "canonical",
                warnings: [],
                classification: "front",
                elevationRad: 0.45,
                forwardness: 0.65,
                observedAgeMs: 0,
            },
            right: {
                ...temporal.arms.right,
                state: "tracked",
                confidence: 0.9,
                source: "canonical",
                warnings: [],
                observedAgeMs: 0,
            },
        },
        warnings: [],
    };
}
