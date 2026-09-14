import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CharacterBehaviorState } from "../../../character/behavior/characterBehaviorState";
import { parseMotionDebugLogLines } from "../../../character/motionEvaluation/motionDebugLogSchema";
import {
    createPoint,
    createPose,
} from "../../../character/reliability/__tests__/poseReliabilityEstimatorFixtures";
import { SincroMotionObserveOnlyPipeline } from "../../../character/runtime/sincroMotionObserveOnlyPipeline";
import { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import { createDefaultSnapshot } from "../../../features/debug/model/debugConsoleSnapshot";
import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "../../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import {
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandMotionSnapshot,
} from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";
import { TrackerRuntime } from "../../../features/gaze/trackingRuntime/trackerRuntime";
import {
    resolveTrackerRuntimePerformanceProfile,
    TRACKER_RUNTIME_PERFORMANCE_PROFILE_SCHEMA_VERSION,
    type TrackerRuntimePerformanceProfile,
} from "../../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";
import type { TrackerVideoFrameTiming } from "../../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import type { MotionDebugCameraRuntime } from "../motionDebugCameraRuntime";
import type { MotionDebugLiveFrame } from "../motionDebugLiveComputation";
import { MotionDebugRecordingController } from "../motionDebugRecordingController";
import { MotionDebugTrackerBridge } from "../motionDebugTrackerBridge";
import type { MotionDebugPoseOverlayRenderer } from "../poseOverlayRenderer";

type ControllerHarnessOptions = {
    activeStream?: MediaStream;
    performanceProfile?: TrackerRuntimePerformanceProfile;
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

    it("本番と同じ観測順の計算を録画前後も維持し、入力停止時だけ初期化する", async () => {
        let callbacks!: Parameters<TrackerRuntime["startFaceTracking"]>[1];
        vi.spyOn(TrackerRuntime.prototype, "startFaceTracking").mockImplementation(
            async (_track, next) => {
                callbacks = next;
            },
        );
        vi.spyOn(TrackerRuntime.prototype, "stopFaceTracking").mockImplementation(() => {});
        const { controller } = createControllerHarness({ activeStream: createMediaStream() });
        const behavior = CharacterBehaviorState.getManager();
        let latest: MotionDebugLiveFrame | undefined;
        const bridge = new MotionDebugTrackerBridge({
            video: createVideoElement(),
            camera: {
                updateFrameTiming() {},
                updateCameraQuality() {},
                getCameraQuality: () => undefined,
                getCameraSource: () => "fixture",
            } as unknown as MotionDebugCameraRuntime,
            behaviorState: behavior,
            debugConsole: DebugConsoleManager.getManager(),
            overlayRenderer: { render() {} } as unknown as MotionDebugPoseOverlayRenderer,
            recording: controller,
            getAvatarMotionProfile: () => undefined,
            onLiveFrame: (frame) => {
                latest = frame;
            },
            onError: (error) => {
                throw error;
            },
        });
        const reference = new SincroMotionObserveOnlyPipeline();
        const profile = resolveTrackerRuntimePerformanceProfile({
            defaultProfileId: "debug",
        }).profile;
        await bridge.start(createVideoTrack(), profile);
        const face = createFaceSnapshot();
        const hand = createHandSnapshot();
        const poses = [
            createPose(),
            createPose({ leftWrist: createPoint([0.4, 0.2], [-0.7, 0.5, 0.1]) }),
            createPose({ detected: false }),
            createPose(),
        ];
        for (const [index, pose] of poses.entries()) {
            const mediaTimeMs = 100 + index * 100;
            const timing = createFrameTiming(mediaTimeMs);
            const input = {
                mediaTimeMs,
                receivedAtMs: mediaTimeMs,
                video: { width: 1280, height: 720 },
            };
            if (index === 1) expect(controller.start({ compression: "none" }).ok).toBe(true);
            if (index === 3) expect(controller.stop().ok).toBe(true);
            callbacks.onFaceMotion?.(face, timing);
            reference.updateFace(face, input);
            if (index > 0) {
                const currentHand = index === 2 ? DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT : hand;
                callbacks.onHandMotion?.(currentHand, timing);
                reference.updateHand(currentHand, input);
            }
            callbacks.onPoseMotion?.(pose, timing);
            const expected = reference.updatePose(pose, input).state;
            // 検証専用のphase9・後処理・保存診断は比較せず、共有する計算状態全体を照合する。
            expect(latest?.state).toEqual(expected);
            expect(behavior.getSnapshot(mediaTimeMs).sincroMotionPipeline).toEqual(expected);
            expect(latest?.postProcessing).toBeDefined();
            if (index === 0) expect(latest?.state.hand).toBeUndefined();
            if (index === 1 && latest) {
                expect(controller.recordPoseFrame(pose, latest, timing)).toMatchObject({
                    ok: true,
                    skippedReason: "duplicate_frame",
                });
                expect(controller.getState().frameCount).toBe(1);
            }
        }
        expect(controller.getState().frameCount).toBe(2);
        // biome-ignore lint/complexity/useLiteralKeys: 保存形式を読み戻して検証する。
        const blob = await controller["recorder"].exportBlob({ compression: "none" });
        expect(blob.ok).toBe(true);
        if (!blob.ok) throw new Error(blob.message);
        const parsed = parseMotionDebugLogLines((await blob.blob.text()).trim().split("\n"));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error("記録の読み戻し失敗");
        expect(parsed.frames.map((frame) => frame.timestamp.mediaTimeMs)).toEqual([200, 300]);
        for (const frame of parsed.frames) {
            expect(frame.solver).toMatchObject({
                phase7: expect.any(Object),
                phase9: expect.any(Object),
            });
            // プロファイル未到着の従来契約ではphase6とfinalPoseを捏造しない。
            expect(frame.solver).not.toHaveProperty("phase6");
            expect(frame.finalPose).toBeUndefined();
            expect(frame.temporal).toMatchObject({
                timestamp: { mediaTimeMs: frame.timestamp.mediaTimeMs },
            });
        }
        bridge.stop("source_stopped");
        expect(bridge.snapshotState()).toMatchObject({ hand: undefined, reliability: undefined });
        reference.reset();
        await bridge.start(createVideoTrack(), profile);
        const pose = createPose();
        callbacks.onPoseMotion?.(pose, createFrameTiming(20));
        expect(latest?.state).toEqual(
            reference.updatePose(pose, {
                mediaTimeMs: 20,
                receivedAtMs: 20,
                video: { width: 1280, height: 720 },
            }).state,
        );
        expect(latest?.state.hand).toBeUndefined();
        expect(latest?.state.intent.warnings).not.toContain("invalid_dt");
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

    it.each(["unknown", "not-a-commit", " abc123 "])(
        "omits an invalid build commit: %s",
        (gitCommit) => {
            const harness = createControllerHarness({ activeStream: createMediaStream() });

            // biome-ignore lint/complexity/useLiteralKeys: manifest の保存契約を公開 API にせず直接検証する。
            const manifest = harness.controller["createManifest"](gitCommit);

            expect(manifest?.build).not.toHaveProperty("gitCommit");
        },
    );
});

function createControllerHarness(options: ControllerHarnessOptions = {}) {
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
        getAvatarMotionProfile: () => undefined,
        getActivePerformanceProfile: () => performanceProfile,
        getVrmUrl: () => "/characters/default.vrm",
        onStateChange: () => {},
    });
    return {
        controller,
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
