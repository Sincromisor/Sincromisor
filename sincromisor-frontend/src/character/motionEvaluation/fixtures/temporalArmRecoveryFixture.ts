import { createDefaultPoseMotionSnapshot } from "../../../features/debug/model/debugConsoleMotionSnapshot";
import type { MinimalAvatarMotionProfile } from "../../avatarProfile/minimalAvatarMotionProfile";
import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalUpperBodyState,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "../../canonical/canonicalUpperBodyState";
import { createDefaultReliabilityMap } from "../../reliability/reliabilityMap";
import { createSincroPoseTemporalArmInput } from "../../retargeting/sincroPoseTemporalArmInput";
import { TemporalStateEstimator } from "../../temporal/temporalStateEstimator";
import type { SincroMotionDebugFrame } from "../motionDebugLogSchema";
import { SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION } from "../motionDebugLogSchema";
import type { MotionP0FixtureId } from "../motionMetricTypes";

export type TemporalArmRecoveryFixtureId = Extract<
    MotionP0FixtureId,
    "left-arm-occlusion-recovery" | "right-arm-occlusion-recovery"
>;

const FRAME_INTERVAL_MS = 1000 / 30;
const TRACKED_PREFIX_FRAMES = 12;
const OCCLUDED_FRAMES = 30;
const RECOVERED_FRAMES = 22;
const PROFILE: MinimalAvatarMotionProfile = {
    schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
    optionalBones: {
        upperChest: true,
        leftShoulder: true,
        rightShoulder: true,
        leftHand: true,
        rightHand: true,
        leftThumbProximal: false,
        rightThumbProximal: false,
        leftIndexProximal: false,
        rightIndexProximal: false,
    },
    measurements: {
        shoulderWidth: 1,
        leftUpperArmLength: 0.45,
        leftLowerArmLength: 0.55,
        rightUpperArmLength: 0.45,
        rightLowerArmLength: 0.55,
        headSize: 0.3,
    },
    torso: { distribution: { spine: 0.25, chest: 0.4, upperChest: 0.35 } },
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

/**
 * 左右いずれか一方だけを決定的に occlusion させる motion-debug NDJSON を生成する。
 *
 * 欠損系列は production の 700ms prediction と 260ms recovery blend を迂回せず、保存済み
 * temporal/source は同じ canonical/reliability 入力から毎回再計算する。
 */
export function generateTemporalArmRecoveryFixture(id: TemporalArmRecoveryFixtureId): string {
    const side = id === "left-arm-occlusion-recovery" ? "left" : "right";
    const estimator = new TemporalStateEstimator();
    const snapshot = createDefaultPoseMotionSnapshot();
    const frames: SincroMotionDebugFrame[] = [];
    const frameCount = TRACKED_PREFIX_FRAMES + OCCLUDED_FRAMES + RECOVERED_FRAMES;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const mediaTimeMs = Number((frameIndex * FRAME_INTERVAL_MS).toFixed(6));
        const occluded =
            frameIndex >= TRACKED_PREFIX_FRAMES &&
            frameIndex < TRACKED_PREFIX_FRAMES + OCCLUDED_FRAMES;
        const canonical = createCanonical(mediaTimeMs, side, occluded);
        const reliability = createDefaultReliabilityMap(mediaTimeMs);
        setArmReliabilityTracked(reliability, "left");
        setArmReliabilityTracked(reliability, "right");
        if (occluded) {
            setArmReliabilityLost(reliability, side);
        }
        const temporal = estimator.update({ canonical, reliability, mediaTimeMs });
        const sources = {
            left: createSincroPoseTemporalArmInput({
                snapshot,
                temporal,
                profile: PROFILE,
                solver: { shoulderWidth: 1, upperArmLength: 0.45, lowerArmLength: 0.55 },
                side: "left",
            }).source,
            right: createSincroPoseTemporalArmInput({
                snapshot,
                temporal,
                profile: PROFILE,
                solver: { shoulderWidth: 1, upperArmLength: 0.45, lowerArmLength: 0.55 },
                side: "right",
            }).source,
        };
        frames.push(
            createFrame(
                frameIndex,
                mediaTimeMs,
                canonical,
                reliability,
                temporal,
                sources,
                occluded,
            ),
        );
    }
    const manifest = {
        recordType: "manifest",
        manifest: {
            schemaVersion: SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
            createdAtIso: "2026-07-12T00:00:00.000Z",
            source: { kind: "synthetic", fixtureId: id },
            environment: {
                userAgent: "deterministic-fixture",
                devicePixelRatio: 1,
                viewport: { width: 640, height: 480 },
            },
            build: { packageVersions: {}, configHash: "temporal-arm-recovery-v1" },
            camera: { actualSettings: { width: 640, height: 480, frameRate: 30 } },
            pipeline: { temporalConfig: "production-default" },
            avatar: { avatarProfileId: "fixture-profile", boneCapabilities: {} },
        },
    };
    const lines = [manifest, ...frames.map((frame) => ({ recordType: "frame", frame }))]
        .map((line) => JSON.stringify(line))
        .join("\n");
    return `${lines}\n`;
}

function createCanonical(
    mediaTimeMs: number,
    occludedSide: "left" | "right",
    occluded: boolean,
): CanonicalUpperBodyState {
    const arm = (side: "left" | "right"): CanonicalArmState => ({
        confidence: occluded && side === occludedSide ? 0 : 1,
        source: "pose",
        warnings: occluded && side === occludedSide ? ["dropout"] : [],
        outOfRangeFields: [],
        reach: 0.55,
        elevationRad: 0.2,
        openness: 0.4,
        forwardness: 0.25,
        elbowFlexionRad: 1.1,
        classification: "front",
        bodyLocalWrist: [side === "left" ? -0.45 : 0.45, 0.25, 0.2],
        bodyLocalElbow: [side === "left" ? -0.25 : 0.25, 0.15, 0.1],
    });
    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: { mediaTimeMs, poseLastUpdatedAtMs: mediaTimeMs },
        torso: {
            confidence: 1,
            source: "pose",
            warnings: [],
            outOfRangeFields: [],
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
        arms: { left: arm("left"), right: arm("right") },
        calibration: DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
        warnings: [],
    };
}

function setArmReliabilityLost(
    reliability: ReturnType<typeof createDefaultReliabilityMap>,
    side: "left" | "right",
): void {
    reliability.parts[`${side}Arm`].state = "lost";
    reliability.joints[`${side}Shoulder`].state = "lost";
    reliability.joints[`${side}Elbow`].state = "lost";
    reliability.joints[`${side}Wrist`].state = "lost";
}

function setArmReliabilityTracked(
    reliability: ReturnType<typeof createDefaultReliabilityMap>,
    side: "left" | "right",
): void {
    reliability.parts[`${side}Arm`].state = "tracked";
    reliability.joints[`${side}Shoulder`].state = "tracked";
    reliability.joints[`${side}Elbow`].state = "tracked";
    reliability.joints[`${side}Wrist`].state = "tracked";
}

function createFrame(
    frameIndex: number,
    mediaTimeMs: number,
    canonical: CanonicalUpperBodyState,
    reliability: ReturnType<typeof createDefaultReliabilityMap>,
    temporal: ReturnType<TemporalStateEstimator["update"]>,
    sources: Record<
        "left" | "right",
        {
            primarySource: "temporal" | "pose-snapshot-fallback";
            fallbackReason?: string;
            bridgeReasonCodes: string[];
            targetReachRatio?: number;
            temporalState?: "tracked" | "suspect" | "predicted" | "lost" | "recovering";
        }
    >,
    occluded: boolean,
): SincroMotionDebugFrame {
    const ik = {
        active: true,
        targetClamped: false,
        weight: 1,
        poleState: "stable",
        constraintReasonCodes: [],
    } as const;
    const reach = {
        requestedReachRatio: 0.55,
        appliedReachRatio: 0.55,
        excessReachRatio: 0,
        clampedBy: "none",
    } as const;
    return {
        frameIndex,
        timestamp: { mediaTimeMs, presentedFrames: frameIndex },
        video: { width: 640, height: 480 },
        canonical,
        reliability,
        temporal,
        poseSnapshot: {
            detected: !occluded,
            degradedToFaceOnly: occluded,
            consecutiveFailures: occluded ? 1 : 0,
            upperBody: { shoulderCenterX: 0.5, shoulderCenterY: 0.4 },
            leftArm: { targets: { wrist: { cameraX: 0.3, cameraY: 0.5 } } },
            rightArm: { targets: { wrist: { cameraX: 0.7, cameraY: 0.5 } } },
        },
        solver: {
            phase6: {
                schemaVersion: "sincro.phase6-solver.v1",
                profile: {
                    schemaVersion: PROFILE.schemaVersion,
                    optionalBones: PROFILE.optionalBones,
                    measurements: PROFILE.measurements,
                    solverDefaults: PROFILE.solverDefaults,
                    warnings: [],
                },
                arms: {
                    left: { reach, source: sources.left, ik },
                    right: { reach, source: sources.right, ik },
                },
                warnings: [],
            },
        },
        finalPose: {
            schemaVersion: "sincro.vrm-pose-composer-result.v1",
            finalPose: { leftUpperArm: { x: 0, y: 0, z: 0, w: 1 } },
            ownedBones: ["leftUpperArm"],
            suppressedLayers: [],
            clampedBones: [],
            warnings: [],
        },
        applied: { angularVelocityDegPerSec: 0 },
    };
}
