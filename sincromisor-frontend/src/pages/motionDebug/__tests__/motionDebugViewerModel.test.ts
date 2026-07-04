import { describe, expect, it } from "vitest";
import {
    AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
    type AvatarMotionProfile,
} from "../../../character/avatarProfile/avatarMotionProfile";
import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalPartMeta,
    type CanonicalUpperBodyState,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "../../../character/canonical/canonicalUpperBodyState";
import {
    SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
    type SincroMotionDebugLogManifest,
} from "../../../character/motionEvaluation/motionDebugLogSchema";
import type { MotionDebugFinalPoseSnapshot } from "../../../character/motionEvaluation/motionDebugPhase6Snapshot";
import {
    MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
    type MotionDebugPhase7Snapshot,
} from "../../../character/motionEvaluation/motionDebugPhase7Snapshot";
import { calculateMotionMetricSummary } from "../../../character/motionEvaluation/motionMetrics";
import { MotionReplayPlayer } from "../../../character/motionEvaluation/motionReplayPlayer";
import { createDefaultMotionIntentState } from "../../../character/motionIntent/motionIntentState";
import { createNoopMotionPostProcessingResult } from "../../../character/motionPostProcessing/motionPostProcessingState";
import {
    createDefaultReliabilityMap,
    RELIABILITY_MAP_SCHEMA_VERSION,
    type ReliabilityMap,
} from "../../../character/reliability/reliabilityMap";
import {
    createDefaultTemporalUpperBodyState,
    TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
    type TemporalUpperBodyState,
} from "../../../character/temporal/temporalUpperBodyState";
import { createDefaultSnapshot } from "../../../features/debug/model/debugConsoleSnapshot";
import {
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandMotionSnapshot,
} from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshotClone";
import {
    CAMERA_QUALITY_SCHEMA_VERSION,
    type CameraQualityComponent,
    type CameraQualityScore,
} from "../../../features/gaze/trackingRuntime/cameraQualityScore";
import { TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION } from "../../../features/gaze/trackingRuntime/trackerRuntimeDegradationPolicy";
import { TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION } from "../../../features/gaze/trackingRuntime/trackerRuntimePerformanceBudget";
import { resolveTrackerRuntimePerformanceProfile } from "../../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";
import { MotionDebugApp } from "../motionDebugApp";
import { createMotionDebugViewerSnapshot } from "../motionDebugViewerModel";
import type { MotionDebugSnapshot } from "../types";

function createManifest(): SincroMotionDebugLogManifest {
    return {
        schemaVersion: SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
        createdAtIso: "2026-06-23T12:00:00.000Z",
        source: {
            kind: "video-fixture",
            fixtureId: "minimal-valid-log",
        },
        environment: {
            userAgent: "vitest",
            devicePixelRatio: 2,
            viewport: {
                width: 1280,
                height: 720,
            },
            timeOriginMs: 1000,
        },
        build: {
            appVersion: "0.0.0",
            packageVersions: {},
            configHash: "motion-debug-viewer-test",
        },
        camera: {
            requestedConstraints: {
                fixtureUrl: "/fixtures/minimal.mp4",
            },
            actualSettings: {
                width: 1280,
                height: 720,
                frameRate: 30,
            },
        },
        pipeline: {
            tracker: "mediapipe",
        },
        avatar: {
            avatarProfileId: "default",
            boneCapabilities: {},
        },
    };
}

function createPoseSnapshot(mediaTimeMs: number): SincroPoseMotionSnapshot {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.86,
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            shoulderCenterX: 0.5,
            shoulderCenterY: 0.48,
            shoulderWidth: 0.42,
            hipCenterTracked: true,
        },
        leftArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.82,
            targets: {
                ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets,
                wrist: {
                    ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets.wrist,
                    cameraX: 0.36,
                    cameraY: 0.58,
                    confidence: 0.82,
                },
            },
        },
        rightArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.8,
            targets: {
                ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets,
                wrist: {
                    ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets.wrist,
                    cameraX: 0.64,
                    cameraY: 0.56,
                    confidence: 0.8,
                },
            },
        },
        lowerBodyTargets: DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
        inferenceTimeMs: 8,
        inferenceFps: 12,
        consecutiveFailures: 0,
        degradedToFaceOnly: false,
        lastUpdatedAtMs: mediaTimeMs,
    });
}

const BASE_CANONICAL_META: CanonicalPartMeta = {
    confidence: 1,
    source: "pose",
    warnings: [],
    outOfRangeFields: [],
};

function createCanonicalArmState(overrides: Partial<CanonicalArmState> = {}): CanonicalArmState {
    return {
        ...BASE_CANONICAL_META,
        reach: 0.52,
        elevationRad: 0.12,
        openness: 0.24,
        forwardness: 0.7,
        elbowFlexionRad: 1.05,
        classification: "front",
        bodyLocalWrist: [0.12, 0.2, 0.4],
        bodyLocalElbow: [0.08, 0.12, 0.22],
        ...overrides,
    };
}

function createCanonicalState(mediaTimeMs: number): CanonicalUpperBodyState {
    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs,
            poseLastUpdatedAtMs: mediaTimeMs - 10,
        },
        torso: {
            ...BASE_CANONICAL_META,
            coordinateSystem: "body_local",
            shoulderCenter: [0, 1, 0],
            hipCenter: [0, 0, 0],
            bodyRight: [1, 0, 0],
            bodyUp: [0, 1, 0],
            bodyFront: [0, 0, 1],
            shoulderWidth: 1,
            torsoScale: 1,
            yawRad: 0,
        },
        arms: {
            left: createCanonicalArmState({
                source: "mixed",
                warnings: ["missing_world_coordinates"],
                outOfRangeFields: [
                    {
                        path: "reach",
                        value: 1.3,
                        max: 1.15,
                        clampedValue: 1.15,
                    },
                ],
            }),
            right: createCanonicalArmState({
                source: "pose",
                classification: "side",
                openness: 0.8,
                forwardness: 0.2,
            }),
        },
        calibration: {
            ...DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
            id: `calibration-${mediaTimeMs}`,
        },
        warnings: ["missing_world_coordinates"],
    };
}

function createCameraQuality(mediaTimeMs: number): CameraQualityScore {
    const goodComponent: CameraQualityComponent = { score: 1, status: "good", reasonCodes: [] };
    return {
        schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
        overall: {
            score: 1,
            status: "good",
        },
        components: {
            resolution: goodComponent,
            cadence: goodComponent,
            torsoInFrame: goodComponent,
            handsInFrame: goodComponent,
            borderRisk: goodComponent,
            handSmallRisk: goodComponent,
            motionBlurRisk: goodComponent,
        },
        reasons: [],
        guideMessages: [],
        track: {
            width: 1280,
            height: 720,
            frameRate: 30,
            facingMode: "user",
            readyState: "live",
        },
        sample: {
            mediaTimeMs,
            clockSource: "request-video-frame-callback",
            droppedPresentedFrames: 0,
            videoWidth: 1280,
            videoHeight: 720,
            poseDetected: true,
            poseConfidence: 0.86,
        },
    };
}

function createReliabilityMap(mediaTimeMs: number): ReliabilityMap {
    const reliability = createDefaultReliabilityMap(mediaTimeMs);
    return {
        ...reliability,
        camera: {
            ...reliability.camera,
            videoWidth: 1280,
            videoHeight: 720,
        },
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
            confidence: 0.84,
            roi: {
                side: "left",
                source: "pose-wrist",
                rect: {
                    centerX: 0.34,
                    centerY: 0.58,
                    width: 0.22,
                    height: 0.22,
                    clamped: false,
                },
                confidence: 0.8,
                referencePoint: [0.36, 0.58],
                warnings: [],
            },
            fullFrameWrist: [0.36, 0.58],
            features: {
                ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT.leftHand.features,
                openness: "open",
            },
            warnings: [],
        },
    };
}

function createTemporalState(mediaTimeMs: number): TemporalUpperBodyState {
    const temporal = createDefaultTemporalUpperBodyState(mediaTimeMs);
    return {
        ...temporal,
        timestamp: {
            mediaTimeMs,
            canonicalMediaTimeMs: mediaTimeMs,
            poseLastUpdatedAtMs: mediaTimeMs - 10,
        },
        arms: {
            left: {
                ...temporal.arms.left,
                state: "recovering",
                confidence: 0.72,
                source: "mixed",
                stateAgeMs: 32,
                observedAgeMs: 0,
                warnings: ["recovery_blend"],
                reach: 0.46,
                elevationRad: 0.14,
                openness: 0.2,
                forwardness: 0.65,
                elbowFlexionRad: 1.1,
                bodyLocalWrist: [0.1, 0.2, 0.3],
                velocity: {
                    wrist: [0.01, 0.02, 0.03],
                    reachPerSec: 0.4,
                    elevationRadPerSec: 0.2,
                    opennessPerSec: 0.1,
                    forwardnessPerSec: 0.3,
                    elbowFlexionRadPerSec: 0.5,
                },
                recoveringBlend: {
                    from: "predicted",
                    progress: 0.5,
                    durationMs: 260,
                },
            },
            right: {
                ...temporal.arms.right,
                state: "tracked",
                confidence: 0.9,
                source: "canonical",
                warnings: [],
                bodyLocalWrist: [0.2, 0.2, 0.3],
            },
        },
        warnings: ["recovery_blend"],
    };
}

function createAvatarMotionProfile(): NonNullable<
    MotionDebugSnapshot["poseRetargetRuntime"]["avatarMotionProfile"]
> {
    return {
        schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
        optionalBones: {
            upperChest: true,
            leftShoulder: true,
            rightShoulder: true,
            leftHand: true,
            rightHand: true,
            leftThumbProximal: true,
            rightThumbProximal: true,
            leftIndexProximal: true,
            rightIndexProximal: true,
        },
        measurements: {
            shoulderWidth: 0.4,
            leftUpperArmLength: 0.24,
            leftLowerArmLength: 0.22,
            rightUpperArmLength: 0.24,
            rightLowerArmLength: 0.22,
        },
        torso: {
            distribution: { spine: 0.25, chest: 0.4, upperChest: 0.35 },
        },
        solverDefaults: {
            defaultReachScale: 1,
            depthCompression: 0.55,
            lateralScale: 1,
            verticalScale: 0.92,
            shoulderDamping: 0.65,
            wristRollInfluence: 0.25,
        },
        warnings: [],
    };
}

function createPhase6Solver(): unknown {
    return {
        schemaVersion: "sincro.phase6-solver.v1",
        profile: {
            schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
            optionalBones: {
                leftHand: true,
            },
            measurements: {
                shoulderWidth: 0.4,
            },
            solverDefaults: {
                defaultReachScale: 1,
                depthCompression: 0.55,
                lateralScale: 1,
                verticalScale: 0.92,
                shoulderDamping: 0.65,
                wristRollInfluence: 0.25,
            },
            warnings: [],
        },
        arms: {
            left: {
                ik: {
                    active: true,
                    targetClamped: false,
                    weight: 0.8,
                    poleState: "uncertain",
                    constraintReasonCodes: ["pole_flip_rejected"],
                },
            },
            right: {
                ik: {
                    active: true,
                    targetClamped: false,
                    weight: 0.7,
                    poleState: "stable",
                    constraintReasonCodes: [],
                },
            },
        },
        warnings: [],
    };
}

function createPhase7Snapshot(id = "phase7-calibration"): MotionDebugPhase7Snapshot {
    return {
        schemaVersion: MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
        profile: createFullAvatarMotionProfile(),
        activeCanonicalCalibration: {
            id,
            source: "online",
            neutralYawRad: 0.02,
            shoulderWidth: 0.42,
            torsoScale: 1.04,
            handBaseline: {
                left: {
                    palmSize: 0.08,
                    openSpread: 0.18,
                },
                right: {
                    palmSize: 0.081,
                    openSpread: 0.176,
                },
            },
            capturedAtMediaTimeMs: 240,
        },
        warnings: [],
    };
}

function createPhase9Snapshot(mediaTimeMs = 120) {
    const intent = createDefaultMotionIntentState(mediaTimeMs);
    return {
        schemaVersion: "sincro.phase9-semantic-motion.v1",
        timestamp: { mediaTimeMs },
        intent,
        semantic: {
            schemaVersion: "sincro.phase9-semantic-motion.v1",
            timestamp: { mediaTimeMs },
            presets: [],
            warnings: [],
        },
        finger: {},
        layers: [
            {
                id: "semantic:left:small_wave",
                kind: "semantic",
                weight: 0.5,
                ownedBones: ["leftUpperArm"],
            },
        ],
        warnings: [],
    };
}

function createFinalPose(): MotionDebugFinalPoseSnapshot {
    return {
        schemaVersion: "sincro.vrm-pose-composer-result.v1",
        finalPose: {
            leftUpperArm: { x: 0, y: 0, z: 0, w: 1 },
        },
        ownedBones: ["leftUpperArm"],
        suppressedLayers: [],
        clampedBones: [],
        warnings: [],
    };
}

function createFullAvatarMotionProfile(): AvatarMotionProfile {
    const fingerChain = {
        proximal: true,
        intermediate: true,
        distal: true,
    };
    const hand = {
        thumb: fingerChain,
        index: fingerChain,
        middle: fingerChain,
        ring: fingerChain,
        little: fingerChain,
    };
    return {
        schemaVersion: AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
        model: {
            vrmVersion: "1.0",
            modelName: "Motion debug avatar",
        },
        capabilities: {
            bones: {
                upperChest: true,
                leftShoulder: true,
                rightShoulder: true,
                leftHand: true,
                rightHand: true,
            },
            fingerChains: {
                left: hand,
                right: hand,
            },
        },
        restLocalRotation: {},
        metrics: {
            shoulderWidth: 0.42,
            torsoLength: 0.5,
            headSize: 0.22,
            upperArmLength: {
                left: 0.24,
                right: 0.24,
            },
            lowerArmLength: {
                left: 0.22,
                right: 0.22,
            },
            handSize: {
                left: 0.08,
                right: 0.081,
            },
        },
        torso: {
            distribution: {
                spine: 0.25,
                chest: 0.4,
                upperChest: 0.35,
            },
            chestFollow: 0.55,
        },
        arm: {
            reachScale: 0.92,
            lateralScale: 0.9,
            verticalScale: 0.95,
            depthCompression: 0.6,
            elbowOutwardBias: 0.25,
            shoulderDamping: 0.55,
        },
        wrist: {
            wristRollInfluence: 0.4,
            lowerArmTwistShare: 0.65,
            handTwistShare: 0.35,
        },
        fingers: {
            curlScale: 0.8,
            curlMode: "grouped",
            curlDistribution: {
                proximal: 0.5,
                intermediate: 0.3,
                distal: 0.2,
            },
            splayLimitDeg: 12,
        },
        risk: {
            smallBodyLargeHead: 0.2,
            missingUpperChest: false,
            missingShoulders: false,
            constraintRisk: 0.1,
        },
        warnings: [],
    };
}

function createLiveSnapshot(
    options: {
        canonical?: MotionDebugSnapshot["canonical"];
        reliability?: MotionDebugSnapshot["reliability"];
        temporal?: MotionDebugSnapshot["temporal"];
        hand?: MotionDebugSnapshot["hand"];
        cameraQuality?: CameraQualityScore;
        cameraSource?: MotionDebugSnapshot["camera"]["source"];
        phase7?: MotionDebugPhase7Snapshot;
        finalPose?: MotionDebugSnapshot["finalPose"];
        postProcessing?: MotionDebugSnapshot["postProcessing"];
    } = {},
): MotionDebugSnapshot {
    const debugSnapshot = createDefaultSnapshot().sincroMotion;
    return {
        status: "running",
        message: "test",
        camera: {
            source: options.cameraSource ?? "fixture",
            width: 1280,
            height: 720,
            readyState: 4,
            performanceProfile: resolveTrackerRuntimePerformanceProfile({
                defaultProfileId: "debug",
            }).profile,
            quality: options.cameraQuality,
        },
        recording: {
            status: "stopped",
            frameCount: 2,
            durationMs: 120,
            compression: "gzip",
        },
        pose: createPoseSnapshot(120),
        hand: options.hand,
        reliability: options.reliability,
        canonical: options.canonical,
        temporal: options.temporal,
        postProcessing: options.postProcessing,
        tracker: debugSnapshot.tracker,
        poseRetarget: debugSnapshot.poseRetarget,
        poseRetargetRuntime: debugSnapshot.poseRetargetRuntime,
        phase7: options.phase7,
        finalPose: options.finalPose,
        render: {
            renderFps: 60,
        },
    };
}

function createFrameLine(frameIndex: number, mediaTimeMs: number): string {
    const debugSnapshot = createDefaultSnapshot().sincroMotion;
    return JSON.stringify({
        recordType: "frame",
        frame: {
            frameIndex,
            timestamp: {
                mediaTimeMs,
            },
            video: {
                width: 1280,
                height: 720,
            },
            poseSnapshot: createPoseSnapshot(mediaTimeMs),
            solver: {
                poseRetarget: debugSnapshot.poseRetargetRuntime,
            },
        },
    });
}

function createMinimalLogText(): string {
    return [
        JSON.stringify({ recordType: "manifest", manifest: createManifest() }),
        createFrameLine(0, 120),
        createFrameLine(1, 240),
    ].join("\n");
}

describe("createMotionDebugViewerSnapshot", () => {
    it("projects minimal replay log state and calculated metrics into viewer fields", () => {
        const liveSnapshot = createLiveSnapshot();
        const player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot) => ({
                ...liveSnapshot,
                pose: snapshot,
            }),
            readSnapshot: () => liveSnapshot,
        });
        expect(player.loadRecordingText(createMinimalLogText()).ok).toBe(true);
        expect(player.startReplay({ mode: "pose-snapshot" }).ok).toBe(true);
        const summary = calculateMotionMetricSummary(player.replayFrames(), {
            generatedAtIso: "2026-06-23T12:01:00.000Z",
            thresholdVersion: "initial-v1",
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "metrics",
            selectedLayer: "metrics",
            liveSnapshot,
            replayState: player.getReplayState(),
            replayManifest: player.replayManifest(),
            replayFrame: player.replayFrame(),
            metrics: summary,
        });

        expect(viewer.replay).toMatchObject({
            status: "paused",
            mode: "pose-snapshot",
            frameCount: 2,
            currentFrameIndex: 0,
        });
        expect(viewer.layers.metrics.status).toBe("available");
        expect(viewer.layers.camera.status).toBe("available");
        expect(viewer.layers.canonical.status).toBe("not_implemented");
        expect(viewer.metrics?.metrics.elbowFlipCount.key).toBe("elbowFlipCount");
        expect(viewer.metrics?.metrics.neutralJitter.status).toBe("not_available");
    });

    it("runs QA regression from the motion-debug replay API surface", async () => {
        const liveSnapshot = createLiveSnapshot();
        const player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot) => ({
                ...liveSnapshot,
                pose: snapshot,
            }),
            readSnapshot: () => liveSnapshot,
        });
        const logText = createMinimalLogText();
        expect(player.loadRecordingText(logText).ok).toBe(true);

        const app = Object.create(MotionDebugApp.prototype);
        Object.defineProperty(app, "replay", { value: player });
        Object.defineProperty(app, "setAutoViewerMode", { value: () => undefined });
        Object.defineProperty(app, "renderSnapshot", { value: () => undefined });

        const result = await MotionDebugApp.prototype.runQaRegression.call(app, {
            generatedAtIso: "2026-06-23T12:03:00.000Z",
            thresholdVersion: "initial-v1",
            fixtureId: "neutral-10s",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.result).toMatchObject({
            overall: "warn",
            fixtures: [
                {
                    fixtureId: "neutral-10s",
                    status: "warn",
                    summary: {
                        severity: "warn",
                    },
                },
            ],
        });
    });

    it("analyzes optimization candidates from the loaded recording API surface", async () => {
        const liveSnapshot = createLiveSnapshot();
        const player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot) => ({
                ...liveSnapshot,
                pose: snapshot,
            }),
            readSnapshot: () => liveSnapshot,
        });
        expect(player.loadRecordingText(createMinimalLogText()).ok).toBe(true);

        const app = Object.create(MotionDebugApp.prototype);
        Object.defineProperty(app, "replay", { value: player });
        Object.defineProperty(app, "setAutoViewerMode", { value: () => undefined });
        Object.defineProperty(app, "renderSnapshot", { value: () => undefined });

        const result = await MotionDebugApp.prototype.analyzeOptimizationCandidates.call(app, {
            generatedAtIso: "2026-06-23T12:04:00.000Z",
            thresholdVersion: "initial-v1",
            fixtureId: "neutral-10s",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.report).toMatchObject({
            schemaVersion: "sincro.motion-optimization-candidates.v1",
            sourceQaOverall: "warn",
            candidates: [
                {
                    candidateId: "neutral-10s:do_not_optimize:0",
                    fixtureId: "neutral-10s",
                    target: "do_not_optimize",
                    requiresHumanLabel: false,
                },
            ],
        });
    });

    it("keeps fixture_id_required for candidate analysis when the loaded source is not a P0 fixture", async () => {
        const liveSnapshot = createLiveSnapshot();
        const player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot) => ({
                ...liveSnapshot,
                pose: snapshot,
            }),
            readSnapshot: () => liveSnapshot,
        });
        expect(player.loadRecordingText(createMinimalLogText()).ok).toBe(true);

        const app = Object.create(MotionDebugApp.prototype);
        Object.defineProperty(app, "replay", { value: player });

        const result = await MotionDebugApp.prototype.analyzeOptimizationCandidates.call(app, {
            generatedAtIso: "2026-06-23T12:05:00.000Z",
            thresholdVersion: "initial-v1",
        });

        expect(result).toMatchObject({
            ok: false,
            code: "fixture_id_required",
        });
    });

    it("projects Phase 10 degradation metric results into the metrics layer JSON", () => {
        const liveSnapshot = createLiveSnapshot();
        const summary = calculateMotionMetricSummary(
            [
                {
                    frameIndex: 0,
                    timestamp: {
                        mediaTimeMs: 0,
                        droppedPresentedFrames: 2,
                    },
                    video: {
                        width: 1280,
                        height: 720,
                    },
                    metrics: {
                        tracker: {
                            droppedFrames: 0,
                            budget: {
                                budgetStatus: "over_budget",
                                degradation: {
                                    state: "full",
                                },
                            },
                        },
                    },
                },
            ],
            {
                generatedAtIso: "2026-06-23T12:02:00.000Z",
                thresholdVersion: "initial-v1",
            },
        );

        const viewer = createMotionDebugViewerSnapshot({
            mode: "metrics",
            selectedLayer: "metrics",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
                currentFrameIndex: 0,
            },
            metrics: summary,
        });

        expect(viewer.layers.metrics.status).toBe("available");
        expect(viewer.layers.metrics.value).toMatchObject({
            metrics: {
                trackerBudgetOverrunFrameCount: {
                    value: 1,
                    severity: "warn",
                    threshold: { pass: 0, warn: 30, fail: 90 },
                },
                trackerDroppedFrameCount: {
                    value: 2,
                    severity: "warn",
                    threshold: { pass: 0, warn: 15, fail: 60 },
                },
                degradationStageFrameCount: {
                    value: 0,
                    severity: "pass",
                    threshold: { pass: 0, warn: 45, fail: 150 },
                },
                degradationRecoveryFrameCount: {
                    value: null,
                    severity: "warn",
                    unavailableReason:
                        "degradationRecoveryFrameCount requires frame.metrics.tracker.degradationPolicy.recovering.",
                },
                roiPausedFrameCount: {
                    value: null,
                    severity: "warn",
                    unavailableReason:
                        "roiPausedFrameCount requires frame.metrics.tracker.roi.pauseState.",
                },
            },
        });
    });

    it("does not mark empty recorded layer objects as available", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                solver: {},
            },
        });

        expect(viewer.layers.solver.status).toBe("not_recorded");
    });

    it("marks legacy solver logs without phase6 as not recorded", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                solver: {
                    poseRetarget: createDefaultSnapshot().sincroMotion.poseRetargetRuntime,
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("not_recorded");
    });

    it("marks missing replay intent as not recorded", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "intent",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
            },
        });

        expect(viewer.layers.intent.status).toBe("not_recorded");
    });

    it("shows saved replay intent after strict parsing", () => {
        const liveSnapshot = createLiveSnapshot();
        const intent = createDefaultMotionIntentState(120);
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "intent",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                intent,
            },
        });

        expect(viewer.layers.intent.status).toBe("available");
        expect(viewer.layers.intent.value).toMatchObject({
            schemaVersion: "sincro.motion-intent.v1",
            arms: {
                left: {
                    intent: "tracking",
                    source: "fallback",
                },
            },
            warnings: ["fallback_active"],
        });
    });

    it("marks invalid saved replay intent without failing log load", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "intent",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                intent: {
                    ...createDefaultMotionIntentState(120),
                    arms: {
                        left: {
                            ...createDefaultMotionIntentState(120).arms.left,
                            intent: "thumbs_up",
                        },
                        right: createDefaultMotionIntentState(120).arms.right,
                    },
                },
            },
        });

        expect(viewer.layers.intent.status).toBe("invalid");
        expect(viewer.layers.intent.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                    path: ["arms", "left", "intent"],
                }),
            ]),
        });
    });

    it("marks missing replay postProcessing as not recorded", () => {
        const liveSnapshot = createLiveSnapshot({
            postProcessing: createNoopMotionPostProcessingResult({
                mediaTimeMs: 120,
                source: "live",
            }),
        });
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "postProcessing",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
            },
        });

        expect(viewer.layers.postProcessing.status).toBe("not_recorded");
    });

    it("shows saved replay postProcessing after strict parsing", () => {
        const liveSnapshot = createLiveSnapshot();
        const postProcessing = createNoopMotionPostProcessingResult({
            mediaTimeMs: 120,
            source: "replay",
        });
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "postProcessing",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                postProcessing,
            },
        });

        expect(viewer.layers.postProcessing.status).toBe("available");
        expect(viewer.layers.postProcessing.value).toMatchObject({
            schemaVersion: "sincro.motion-post-processing.v1",
            processor: {
                id: "noop",
                mode: "disabled",
            },
            output: {},
            corrections: [],
            warnings: ["processor_disabled"],
        });
    });

    it("marks invalid saved replay postProcessing without live fallback", () => {
        const liveSnapshot = createLiveSnapshot({
            postProcessing: createNoopMotionPostProcessingResult({
                mediaTimeMs: 120,
                source: "live",
            }),
        });
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "postProcessing",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                postProcessing: {
                    ...createNoopMotionPostProcessingResult({
                        mediaTimeMs: 120,
                        source: "replay",
                    }),
                    processor: {
                        id: "noop",
                        version: "v1",
                        mode: "off",
                    },
                },
            },
        });

        expect(viewer.layers.postProcessing.status).toBe("invalid");
        expect(viewer.layers.postProcessing.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                    path: ["processor", "mode"],
                }),
            ]),
        });
    });

    it("shows live Phase 6 solver snapshot when avatar profile is available", () => {
        const liveSnapshot = createLiveSnapshot();
        liveSnapshot.poseRetargetRuntime.avatarMotionProfile = createAvatarMotionProfile();
        liveSnapshot.poseRetargetRuntime.leftArm.constraint = {
            ...liveSnapshot.poseRetargetRuntime.leftArm.constraint,
            poleState: "uncertain",
            reasonCodes: ["pole_flip_rejected"],
        };

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "available",
                value: {
                    schemaVersion: "sincro.phase6-solver.v1",
                    profile: {
                        schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
                        measurements: {
                            shoulderWidth: 0.4,
                        },
                    },
                    arms: {
                        left: {
                            ik: {
                                poleState: "uncertain",
                                constraintReasonCodes: ["pole_flip_rejected"],
                            },
                        },
                    },
                },
            },
            phase7: {
                status: "not_recorded",
            },
            phase9: {
                status: "not_recorded",
            },
        });
    });

    it("shows invalid solver sublayers without failing finalPose invalid handling", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                solver: {
                    phase6: {
                        schemaVersion: "sincro.phase6-solver.v1",
                        profile: {
                            schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
                        },
                    },
                },
                finalPose: {
                    schemaVersion: "sincro.vrm-pose-composer-result.v1",
                    ownedBones: ["leftUpperArm"],
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "invalid",
                value: {
                    parseStatus: "invalid",
                    raw: {
                        schemaVersion: "sincro.phase6-solver.v1",
                    },
                },
            },
            phase7: {
                status: "not_recorded",
            },
        });
        expect(viewer.layers.finalPose.status).toBe("invalid");
    });

    it("shows saved Phase 6 solver and finalPose replay layers as available", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "finalPose",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                solver: {
                    phase6: createPhase6Solver(),
                },
                finalPose: createFinalPose(),
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "available",
                value: {
                    arms: {
                        left: {
                            ik: {
                                poleState: "uncertain",
                            },
                        },
                    },
                },
            },
            phase7: {
                status: "not_recorded",
            },
        });
        expect(viewer.layers.finalPose.status).toBe("available");
        expect(viewer.layers.finalPose.value).toMatchObject({
            schemaVersion: "sincro.vrm-pose-composer-result.v1",
            ownedBones: ["leftUpperArm"],
        });
    });

    it("shows saved Phase 7 replay sublayer next to Phase 6", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                solver: {
                    phase6: createPhase6Solver(),
                    phase7: createPhase7Snapshot("phase7-replay"),
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "available",
            },
            phase7: {
                status: "available",
                value: {
                    schemaVersion: MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
                    profile: {
                        schemaVersion: AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
                    },
                    activeCanonicalCalibration: {
                        id: "phase7-replay",
                    },
                },
            },
        });
    });

    it("keeps solver available when Phase 7 replay sublayer is invalid", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                solver: {
                    phase6: createPhase6Solver(),
                    phase7: {
                        schemaVersion: MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
                        activeCanonicalCalibration: {
                            id: "phase7-invalid",
                            source: "online",
                            neutralYawRad: 0.02,
                            shoulderWidth: -1,
                            torsoScale: 1.04,
                            handBaseline: {
                                left: {
                                    palmSize: 0.08,
                                    openSpread: 0.18,
                                },
                                right: {
                                    palmSize: 0.081,
                                    openSpread: 0.176,
                                },
                            },
                            capturedAtMediaTimeMs: 240,
                        },
                        warnings: [],
                    },
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "available",
            },
            phase7: {
                status: "invalid",
                value: {
                    parseStatus: "invalid",
                    errors: expect.arrayContaining([
                        expect.objectContaining({
                            code: "out_of_range",
                            path: ["activeCanonicalCalibration", "shoulderWidth"],
                        }),
                    ]),
                },
            },
        });
    });

    it("shows saved Phase 9 replay sublayer as available", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                solver: {
                    phase9: createPhase9Snapshot(120),
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "not_recorded",
            },
            phase7: {
                status: "not_recorded",
            },
            phase9: {
                status: "available",
                value: {
                    schemaVersion: "sincro.phase9-semantic-motion.v1",
                    timestamp: { mediaTimeMs: 120 },
                    intent: {
                        schemaVersion: "sincro.motion-intent.v1",
                    },
                    layers: [
                        {
                            id: "semantic:left:small_wave",
                            kind: "semantic",
                            weight: 0.5,
                            ownedBones: ["leftUpperArm"],
                        },
                    ],
                },
            },
        });
    });

    it("keeps solver available when Phase 9 replay sublayer is invalid", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                solver: {
                    phase9: {
                        ...createPhase9Snapshot(120),
                        intent: {
                            ...createDefaultMotionIntentState(120),
                            arms: {
                                left: {
                                    ...createDefaultMotionIntentState(120).arms.left,
                                    intent: "thumbs_up",
                                },
                                right: createDefaultMotionIntentState(120).arms.right,
                            },
                        },
                    },
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase9: {
                status: "invalid",
                value: {
                    parseStatus: "invalid",
                    errors: expect.arrayContaining([
                        expect.objectContaining({
                            code: "invalid_state",
                            path: ["intent", "arms", "left", "intent"],
                        }),
                    ]),
                },
            },
        });
    });

    it("shows live Phase 7 snapshot from live snapshot state", () => {
        const liveSnapshot = createLiveSnapshot({
            phase7: createPhase7Snapshot("phase7-live"),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "not_recorded",
            },
            phase7: {
                status: "available",
                value: {
                    activeCanonicalCalibration: {
                        id: "phase7-live",
                    },
                },
            },
        });
    });

    it("shows live finalPose snapshot when the app supplies a composer result", () => {
        const liveSnapshot = createLiveSnapshot({
            finalPose: createFinalPose(),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "finalPose",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.finalPose.status).toBe("available");
        expect(viewer.layers.finalPose.value).toMatchObject({
            ownedBones: ["leftUpperArm"],
        });
    });

    it("uses live snapshot canonical as the canonical layer fallback", () => {
        const liveSnapshot = createLiveSnapshot({
            canonical: createCanonicalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "canonical",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.canonical.status).toBe("available");
        expect(viewer.layers.canonical.value).toMatchObject({
            schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
            timestamp: {
                mediaTimeMs: 120,
            },
            arms: {
                left: {
                    reach: 0.52,
                    elevationRad: 0.12,
                    openness: 0.24,
                    forwardness: 0.7,
                    elbowFlexionRad: 1.05,
                    classification: "front",
                    source: "mixed",
                    warnings: ["missing_world_coordinates"],
                    outOfRangeFields: [
                        {
                            path: "reach",
                            clampedValue: 1.15,
                        },
                    ],
                },
                right: {
                    classification: "side",
                },
            },
            calibration: {
                id: "calibration-120",
            },
        });
    });

    it("prefers replay frame canonical over live snapshot canonical", () => {
        const liveSnapshot = createLiveSnapshot({
            canonical: createCanonicalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "canonical",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                canonical: createCanonicalState(240),
            },
        });

        expect(viewer.layers.canonical.status).toBe("available");
        expect(viewer.layers.canonical.value).toMatchObject({
            timestamp: {
                mediaTimeMs: 240,
            },
            calibration: {
                id: "calibration-240",
            },
        });
    });

    it("shows invalid replay canonical as an available parse error summary", () => {
        const liveSnapshot = createLiveSnapshot({
            canonical: createCanonicalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "canonical",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                canonical: {
                    schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
                    timestamp: {
                        mediaTimeMs: 240,
                    },
                },
            },
        });

        expect(viewer.layers.canonical.status).toBe("available");
        expect(viewer.layers.canonical.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                }),
            ]),
            raw: {
                schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
            },
        });
    });

    it("uses live snapshot temporal as the temporal layer value", () => {
        const liveSnapshot = createLiveSnapshot({
            temporal: createTemporalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "temporal",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.temporal.status).toBe("available");
        expect(viewer.layers.temporal.value).toMatchObject({
            schemaVersion: TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
            arms: {
                left: {
                    state: "recovering",
                    confidence: 0.72,
                    source: "mixed",
                    stateAgeMs: 32,
                    observedAgeMs: 0,
                    warnings: ["recovery_blend"],
                    recoveringBlend: {
                        progress: 0.5,
                    },
                    velocity: {
                        wrist: [0.01, 0.02, 0.03],
                    },
                    bodyLocalWrist: [0.1, 0.2, 0.3],
                },
            },
        });
    });

    it("prefers saved replay temporal over live snapshot temporal", () => {
        const liveSnapshot = createLiveSnapshot({
            temporal: createTemporalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "temporal",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                temporal: createTemporalState(240),
            },
        });

        expect(viewer.layers.temporal.status).toBe("available");
        expect(viewer.layers.temporal.value).toMatchObject({
            timestamp: {
                mediaTimeMs: 240,
            },
        });
    });

    it("shows invalid replay temporal as an available parse error summary", () => {
        const liveSnapshot = createLiveSnapshot({
            temporal: createTemporalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "temporal",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                temporal: {
                    schemaVersion: TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
                    timestamp: {
                        mediaTimeMs: 240,
                    },
                },
            },
        });

        expect(viewer.layers.temporal.status).toBe("available");
        expect(viewer.layers.temporal.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                }),
            ]),
            raw: {
                schemaVersion: TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
            },
        });
    });

    it("marks replay temporal as not recorded when old logs do not have frame.temporal", () => {
        const liveSnapshot = createLiveSnapshot({
            temporal: createTemporalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "temporal",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
            },
        });

        expect(viewer.layers.temporal.status).toBe("not_recorded");
        expect(viewer.layers.temporal.value).toBeUndefined();
    });

    it("uses live snapshot reliability as the reliability layer fallback", () => {
        const reliability = createReliabilityMap(120);
        reliability.joints.leftHand = {
            ...reliability.joints.leftHand,
            source: "hand",
        };
        const liveSnapshot = createLiveSnapshot({
            hand: createHandSnapshot(),
            reliability,
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.reliability.status).toBe("available");
        expect(viewer.layers.reliability.value).toMatchObject({
            schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
            timestamp: {
                mediaTimeMs: 120,
            },
            joints: {
                leftHand: {
                    source: "hand",
                },
            },
        });
        expect(liveSnapshot.hand).toMatchObject({
            detected: true,
            leftHand: {
                source: "roi",
                roi: {
                    source: "pose-wrist",
                },
            },
        });
    });

    it("uses saved replay reliability when live snapshot reliability is absent", () => {
        const liveSnapshot = createLiveSnapshot();

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                poseSnapshot: createPoseSnapshot(240),
                reliability: createReliabilityMap(240),
            },
        });

        expect(viewer.layers.reliability.status).toBe("available");
        expect(viewer.layers.reliability.value).toMatchObject({
            timestamp: {
                mediaTimeMs: 240,
            },
        });
        expect(viewer.layers.reliability.value).toMatchObject({
            joints: {
                leftHand: {
                    source: "neutral",
                },
            },
        });
    });

    it("shows invalid replay reliability as an available parse error summary", () => {
        const liveSnapshot = createLiveSnapshot();

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                poseSnapshot: createPoseSnapshot(240),
                reliability: {
                    schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
                    timestamp: {
                        mediaTimeMs: 240,
                    },
                },
            },
        });

        expect(viewer.layers.reliability.status).toBe("available");
        expect(viewer.layers.reliability.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                }),
            ]),
            raw: {
                schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
            },
        });
        expect(viewer.layers.reliability.value).toHaveProperty("raw");
    });

    it("recalculates replay reliability from legacy poseSnapshot frames", () => {
        const liveSnapshot = createLiveSnapshot();

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 640,
                    height: 360,
                },
                poseSnapshot: createPoseSnapshot(230),
            },
        });

        expect(viewer.layers.reliability.status).toBe("available");
        expect(viewer.layers.reliability.value).toMatchObject({
            schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
            timestamp: {
                mediaTimeMs: 240,
                poseLastUpdatedAtMs: 230,
            },
            camera: {
                videoWidth: 640,
                videoHeight: 360,
            },
            joints: {
                leftHand: {
                    source: "neutral",
                    components: {
                        roi: {
                            reasonCodes: ["not_available_in_pose_snapshot"],
                        },
                    },
                },
            },
        });
    });

    it("marks legacy replay reliability as not recorded when poseSnapshot is missing", () => {
        const liveSnapshot = createLiveSnapshot();

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
            },
        });

        expect(viewer.layers.reliability.status).toBe("not_recorded");
        expect(viewer.layers.reliability.value).toBeUndefined();
    });

    it("shows live camera quality in the camera layer", () => {
        const liveSnapshot = createLiveSnapshot({
            cameraQuality: createCameraQuality(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "camera",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.camera.status).toBe("available");
        expect(viewer.layers.camera.value).toMatchObject({
            source: "fixture",
            quality: {
                schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
                sample: {
                    mediaTimeMs: 120,
                },
            },
        });
    });

    it("keeps source none camera layer unrecorded when quality is absent", () => {
        const liveSnapshot = createLiveSnapshot({
            cameraSource: "none",
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "camera",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.camera.status).toBe("not_recorded");
    });

    it("prefers replay frame metrics cameraQuality over replay manifest camera", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "camera",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayManifest: createManifest(),
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                metrics: {
                    cameraQuality: createCameraQuality(240),
                },
            },
        });

        expect(viewer.layers.camera.status).toBe("available");
        expect(viewer.layers.camera.value).toMatchObject({
            schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
            sample: {
                mediaTimeMs: 240,
            },
        });
        expect(viewer.layers.camera.value).not.toHaveProperty("actualSettings");
    });

    it("shows replay tracker performance budget in the metrics layer JSON", () => {
        const liveSnapshot = createLiveSnapshot();
        const trackerBudget = {
            schemaVersion: TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION,
            target: {
                faceTargetFps: 15,
                poseTargetFps: 12,
                frameBudgetMs: 66.66666666666667,
                poseBudgetMs: 83.33333333333333,
            },
            observed: {
                clockSource: "request-video-frame-callback",
                workerRoundTripMs: 78,
                workerTimeMs: 61,
                droppedFrames: 1,
            },
            budgetStatus: "warn",
            degradation: {
                state: "full",
            },
            reasonCodes: ["worker_round_trip_warn", "worker_pending_frame_dropped"],
        };
        const roiStats = {
            pauseState: "hand-paused",
            fallbackCount: 2,
            skippedFrames: 4,
            consecutiveOverBudgetFrames: 0,
            reasonCodes: ["face_roi_skipped", "roi_fallback_full_frame", "hand_roi_paused"],
        };
        const degradationPolicy = {
            schemaVersion: TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION,
            stage: "roi-hand-paused",
            previousStage: "optional-pass-reduced-fps",
            reasonCodes: ["worker_round_trip_warn", "hand_roi_paused"],
            sinceMediaTimeMs: 220,
            effectiveCadence: {
                faceFps: 15,
                poseFps: 12,
                handFps: 4,
                faceRoiFps: 5,
                gestureFps: 3,
            },
            recovering: false,
        };

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "metrics",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                metrics: {
                    tracker: {
                        mode: "worker",
                        status: "running",
                        transferTimeMs: 3,
                        workerRoundTripMs: 78,
                        workerTimeMs: 61,
                        effectiveFaceRoiFps: 3,
                        loadTimeMs: 120,
                        droppedFrames: 1,
                        roi: roiStats,
                        budget: trackerBudget,
                        degradationPolicy,
                    },
                },
            },
        });

        expect(viewer.layers.metrics.status).toBe("available");
        expect(viewer.layers.metrics.value).toMatchObject({
            tracker: {
                roi: roiStats,
                degradationPolicy: {
                    schemaVersion: TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION,
                    stage: "roi-hand-paused",
                    reasonCodes: ["worker_round_trip_warn", "hand_roi_paused"],
                    effectiveCadence: {
                        handFps: 4,
                        faceRoiFps: 5,
                        gestureFps: 3,
                    },
                },
                effectiveFaceRoiFps: 3,
                budget: {
                    schemaVersion: TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION,
                    budgetStatus: "warn",
                },
            },
            activePerformanceProfile: {
                id: "debug",
            },
        });
        expect(viewer.metrics).toBeUndefined();
    });
});
