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
import { createDefaultMotionIntentState } from "../../../character/motionIntent/motionIntentState";
import {
    createDefaultReliabilityMap,
    type ReliabilityMap,
} from "../../../character/reliability/reliabilityMap";
import {
    createDefaultTemporalUpperBodyState,
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
import { resolveTrackerRuntimePerformanceProfile } from "../../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";
import type { MotionDebugSnapshot } from "../types";

export function createManifest(): SincroMotionDebugLogManifest {
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

export function createPoseSnapshot(mediaTimeMs: number): SincroPoseMotionSnapshot {
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

export function createCanonicalState(mediaTimeMs: number): CanonicalUpperBodyState {
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

export function createCameraQuality(mediaTimeMs: number): CameraQualityScore {
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

export function createReliabilityMap(mediaTimeMs: number): ReliabilityMap {
    const reliability = createDefaultReliabilityMap(mediaTimeMs);
    return {
        ...reliability,
        camera: {
            ...reliability.camera,
            videoWidth: 1280,
            videoHeight: 720,
        },
        gesture: {
            ...reliability.gesture,
            source: "gesture",
            side: "left",
            label: "Open_Palm",
            confidence: 0.88,
            finalWeight: 0.72,
            stableDurationMs: 220,
            lastUpdatedAtMs: mediaTimeMs,
            warnings: [],
        },
    };
}

export function createHandSnapshot(): SincroHandMotionSnapshot {
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

export function createTemporalState(mediaTimeMs: number): TemporalUpperBodyState {
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

export function createAvatarMotionProfile(): NonNullable<
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

export function createPhase6Solver(): unknown {
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

export function createPhase7Snapshot(id = "phase7-calibration"): MotionDebugPhase7Snapshot {
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

export function createPhase9Snapshot(mediaTimeMs = 120) {
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

export function createFinalPose(): MotionDebugFinalPoseSnapshot {
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

export function createLiveSnapshot(
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

export function createMinimalLogText(): string {
    return [
        JSON.stringify({ recordType: "manifest", manifest: createManifest() }),
        createFrameLine(0, 120),
        createFrameLine(1, 240),
    ].join("\n");
}
