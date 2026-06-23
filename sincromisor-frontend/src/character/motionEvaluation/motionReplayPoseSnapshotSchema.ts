import { z } from "zod";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";

const finiteNumberSchema = z.number().finite();
const poseTargetQualitySchema = z.enum(["strong", "weak", "lost"]);
const poseWorldAnchorSchema = z.enum(["shoulder_center", "hips_center", "none"]);

const poseWorldTargetSnapshotSchema = z
    .object({
        coordinateSystem: z.literal("mediapipe_world"),
        anchor: poseWorldAnchorSchema,
        hasWorldCoordinates: z.boolean(),
        worldQuality: poseTargetQualitySchema,
        worldConfidence: finiteNumberSchema,
        worldUsableForIk: z.boolean(),
        worldIkWeight: finiteNumberSchema,
        worldStaleReason: z.string().optional(),
        rawX: finiteNumberSchema.optional(),
        rawY: finiteNumberSchema.optional(),
        rawZ: finiteNumberSchema.optional(),
        localX: finiteNumberSchema.optional(),
        localY: finiteNumberSchema.optional(),
        localZ: finiteNumberSchema.optional(),
        normalizedX: finiteNumberSchema.optional(),
        normalizedY: finiteNumberSchema.optional(),
        normalizedZ: finiteNumberSchema.optional(),
    })
    .strict();

const poseTargetPointSnapshotSchema = z
    .object({
        tracked: z.boolean(),
        quality: poseTargetQualitySchema,
        confidence: finiteNumberSchema,
        visibility: finiteNumberSchema,
        presence: finiteNumberSchema,
        hasFiniteCoordinates: z.boolean(),
        usableForIk: z.boolean(),
        ikWeight: finiteNumberSchema,
        stale: z.boolean(),
        staleReason: z.string().optional(),
        cameraX: finiteNumberSchema,
        cameraY: finiteNumberSchema,
        cameraZ: finiteNumberSchema.optional(),
        localX: finiteNumberSchema,
        localY: finiteNumberSchema,
        localZ: finiteNumberSchema.optional(),
        world: poseWorldTargetSnapshotSchema,
    })
    .strict();

const poseArmTargetSnapshotSchema = z
    .object({
        shoulder: poseTargetPointSnapshotSchema,
        elbow: poseTargetPointSnapshotSchema,
        wrist: poseTargetPointSnapshotSchema,
    })
    .strict();

const poseLowerBodyTargetSnapshotSchema = z
    .object({
        leftHip: poseTargetPointSnapshotSchema,
        rightHip: poseTargetPointSnapshotSchema,
        leftKnee: poseTargetPointSnapshotSchema,
        rightKnee: poseTargetPointSnapshotSchema,
        leftAnkle: poseTargetPointSnapshotSchema,
        rightAnkle: poseTargetPointSnapshotSchema,
    })
    .strict();

const poseArmMotionSnapshotSchema = z
    .object({
        tracked: z.boolean(),
        confidence: finiteNumberSchema,
        upperArmLift: finiteNumberSchema,
        upperArmOpen: finiteNumberSchema,
        lowerArmFlex: finiteNumberSchema,
        wristRaise: finiteNumberSchema,
        targets: poseArmTargetSnapshotSchema,
    })
    .strict();

const poseUpperBodyMotionSnapshotSchema = z
    .object({
        shoulderRoll: finiteNumberSchema,
        torsoLean: finiteNumberSchema,
        shoulderWidth: finiteNumberSchema,
        shoulderCenterX: finiteNumberSchema,
        shoulderCenterY: finiteNumberSchema,
        hipCenterTracked: z.boolean(),
    })
    .strict();

const poseMotionSnapshotSchema = z
    .object({
        trackingEnabled: z.boolean(),
        detected: z.boolean(),
        confidence: finiteNumberSchema,
        upperBody: poseUpperBodyMotionSnapshotSchema,
        leftArm: poseArmMotionSnapshotSchema,
        rightArm: poseArmMotionSnapshotSchema,
        lowerBodyTargets: poseLowerBodyTargetSnapshotSchema,
        inferenceTimeMs: finiteNumberSchema,
        inferenceFps: finiteNumberSchema,
        consecutiveFailures: z.number().int(),
        degradedToFaceOnly: z.boolean(),
        lastUpdatedAtMs: finiteNumberSchema.optional(),
        fallbackReason: z.string().optional(),
    })
    .strict();

export function parseReplayPoseSnapshot(value: unknown): SincroPoseMotionSnapshot | undefined {
    const result = poseMotionSnapshotSchema.safeParse(value);
    if (!result.success) {
        return undefined;
    }
    return result.data;
}
