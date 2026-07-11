import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMotionDebugLogLines } from "../../../character/motionEvaluation/motionDebugLogSchema";
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
import {
    resolveTrackerRuntimePerformanceProfile,
    TRACKER_RUNTIME_PERFORMANCE_PROFILE_SCHEMA_VERSION,
    type TrackerRuntimePerformanceProfile,
} from "../../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";
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

type ControllerHarnessOptions = {
    activeStream?: MediaStream;
    performanceProfile?: TrackerRuntimePerformanceProfile;
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

afterEach(() => {
    vi.unstubAllGlobals();
});

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

describe("MotionDebugRecordingController manifest", () => {
    beforeEach(() => {
        vi.stubGlobal("window", {
            devicePixelRatio: 2,
            innerWidth: 1280,
            innerHeight: 720,
        });
        vi.stubGlobal("navigator", { userAgent: "vitest" });
    });

    it("saves the active performance profile in manifest.pipeline", () => {
        const performanceProfile = resolveTrackerRuntimePerformanceProfile({
            performanceProfileId: "mobile-safari",
        }).profile;
        const harness = createControllerHarness({
            activeStream: createMediaStream(),
            performanceProfile,
        });

        // biome-ignore lint/complexity/useLiteralKeys: manifest の保存契約を公開 API にせず直接検証する。
        const manifest = harness.controller["createManifest"]();

        expect(manifest?.pipeline.performanceProfile).toMatchObject({
            schemaVersion: TRACKER_RUNTIME_PERFORMANCE_PROFILE_SCHEMA_VERSION,
            id: "mobile-safari",
        });
        expect(manifest?.pipeline.poseTargetInferenceFps).toBe(4);
    });

    it("normalizes a valid build commit and keeps the v1 manifest parseable", () => {
        const harness = createControllerHarness({ activeStream: createMediaStream() });

        // biome-ignore lint/complexity/useLiteralKeys: manifest の保存契約を公開 API にせず直接検証する。
        const manifest = harness.controller["createManifest"]("  ABCDEF1234567  ");

        expect(manifest?.build.gitCommit).toBe("abcdef1234567");
        const parsed = parseMotionDebugLogLines([
            JSON.stringify({ recordType: "manifest", manifest }),
        ]);
        expect(parsed.ok).toBe(true);
    });

    it("omits the build commit when the build constant is absent", () => {
        const harness = createControllerHarness({ activeStream: createMediaStream() });

        // biome-ignore lint/complexity/useLiteralKeys: manifest の保存契約を公開 API にせず直接検証する。
        const manifest = harness.controller["createManifest"](undefined);

        expect(manifest?.build).not.toHaveProperty("gitCommit");
    });

    it.each([
        "unknown",
        "not-a-commit",
        " abc123 ",
    ])("omits an invalid build commit: %s", (gitCommit) => {
        const harness = createControllerHarness({ activeStream: createMediaStream() });

        // biome-ignore lint/complexity/useLiteralKeys: manifest の保存契約を公開 API にせず直接検証する。
        const manifest = harness.controller["createManifest"](gitCommit);

        expect(manifest?.build).not.toHaveProperty("gitCommit");
    });
});

function createControllerHarness(options: ControllerHarnessOptions = {}): ControllerHarness {
    let latestIntent: ReturnType<ControllerHarness["getLatestIntent"]>;
    const debugSnapshot = createDefaultSnapshot().sincroMotion;
    const performanceProfile =
        options.performanceProfile ??
        resolveTrackerRuntimePerformanceProfile({ defaultProfileId: "debug" }).profile;
    const controller = new MotionDebugRecordingController({
        video: createVideoElement(),
        getActiveStream: () => options.activeStream,
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
        getActivePerformanceProfile: () => performanceProfile,
        getVrmUrl: () => "/characters/default.vrm",
        onCanonicalStateChange: () => {},
        onCanonicalReliabilityInputChange: () => {},
        onReliabilityStateChange: () => {},
        onTemporalStateChange: () => {},
        onIntentStateChange: (state) => {
            latestIntent = state;
        },
        onPostProcessingStateChange: () => {},
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

function createMediaStream(): MediaStream {
    const stream: MediaStream = Object.create(null);
    Object.defineProperty(stream, "getVideoTracks", {
        value: () => [createVideoTrack()],
    });
    return stream;
}

function createVideoTrack(): MediaStreamTrack {
    const track: MediaStreamTrack = Object.create(null);
    Object.defineProperty(track, "getSettings", {
        value: () => ({
            width: 640,
            height: 480,
            frameRate: 15,
            facingMode: "user",
        }),
    });
    return track;
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
