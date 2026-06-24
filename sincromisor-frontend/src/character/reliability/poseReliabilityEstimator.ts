import type { SincroPoseTargetPointSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    averageComponentSets,
    averageComponents,
    component,
    evaluateArmBoneLength,
    evaluateBodyScale,
    evaluateBorder,
    evaluateCameraQuality,
    evaluateModelScalar,
    evaluateTargetTracking,
    evaluateTemporal,
    finiteOrZero,
    goodComponent,
    isFiniteNumber,
    isPoseTargetLost,
} from "./poseReliabilityComponents";
import {
    createReliability,
    createUnavailableGesture,
    createUnavailableJoint,
    createUnavailablePart,
    uniqueWarnings,
} from "./poseReliabilityFactories";
import type {
    ArmSide,
    PoseReliabilityEstimatorInput,
    ReliabilityComponentSet,
    ReliabilityJointName,
    ReliabilityScoreComponent,
} from "./poseReliabilityTypes";
import {
    type JointReliability,
    type PartReliability,
    RELIABILITY_MAP_SCHEMA_VERSION,
    type ReliabilityMap,
} from "./reliabilityMap";

export type { PoseReliabilityEstimatorInput } from "./poseReliabilityTypes";

export function createPoseReliabilityMap(input: PoseReliabilityEstimatorInput): ReliabilityMap {
    const cameraQuality = evaluateCameraQuality(input.cameraQuality);
    const bodyScale = evaluateBodyScale(input.pose, input.previous?.pose);
    const leftBoneLength = evaluateArmBoneLength(input.pose.leftArm, input.previous?.pose.leftArm);
    const rightBoneLength = evaluateArmBoneLength(
        input.pose.rightArm,
        input.previous?.pose.rightArm,
    );
    const joints = createJoints(input, bodyScale, cameraQuality, leftBoneLength, rightBoneLength);
    const parts = createParts(input, joints, bodyScale, cameraQuality);
    return {
        schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
        timestamp: createTimestamp(input),
        camera: {
            videoWidth: finiteOrZero(input.video.width),
            videoHeight: finiteOrZero(input.video.height),
            cameraQualityScore: cameraQuality.score,
            cameraQualityStatus: input.cameraQuality?.overall.status ?? "unknown",
            reasonCodes: cameraQuality.reasonCodes,
        },
        joints,
        parts,
        gesture: createUnavailableGesture(cameraQuality),
        warnings: uniqueWarnings([
            ...Object.values(joints).flatMap((joint) => joint.warnings),
            ...Object.values(parts).flatMap((part) => part.warnings),
        ]),
    };
}

function createTimestamp(input: PoseReliabilityEstimatorInput): ReliabilityMap["timestamp"] {
    const timestamp: ReliabilityMap["timestamp"] = { mediaTimeMs: finiteOrZero(input.mediaTimeMs) };
    if (isFiniteNumber(input.pose.lastUpdatedAtMs)) {
        timestamp.poseLastUpdatedAtMs = input.pose.lastUpdatedAtMs;
    }
    return timestamp;
}

function createJoints(
    input: PoseReliabilityEstimatorInput,
    bodyScale: ReliabilityScoreComponent,
    cameraQuality: ReliabilityScoreComponent,
    leftBoneLength: ReliabilityScoreComponent,
    rightBoneLength: ReliabilityScoreComponent,
): ReliabilityMap["joints"] {
    return {
        leftShoulder: createJointReliability(input, {
            point: input.pose.leftArm.targets.shoulder,
            previousPoint: input.previous?.pose.leftArm.targets.shoulder,
            boneLength: leftBoneLength,
            bodyScale,
            cameraQuality,
        }),
        rightShoulder: createJointReliability(input, {
            point: input.pose.rightArm.targets.shoulder,
            previousPoint: input.previous?.pose.rightArm.targets.shoulder,
            boneLength: rightBoneLength,
            bodyScale,
            cameraQuality,
        }),
        leftElbow: createJointReliability(input, {
            point: input.pose.leftArm.targets.elbow,
            previousPoint: input.previous?.pose.leftArm.targets.elbow,
            boneLength: leftBoneLength,
            bodyScale,
            cameraQuality,
        }),
        rightElbow: createJointReliability(input, {
            point: input.pose.rightArm.targets.elbow,
            previousPoint: input.previous?.pose.rightArm.targets.elbow,
            boneLength: rightBoneLength,
            bodyScale,
            cameraQuality,
        }),
        leftWrist: createJointReliability(input, {
            point: input.pose.leftArm.targets.wrist,
            previousPoint: input.previous?.pose.leftArm.targets.wrist,
            boneLength: leftBoneLength,
            bodyScale,
            cameraQuality,
        }),
        rightWrist: createJointReliability(input, {
            point: input.pose.rightArm.targets.wrist,
            previousPoint: input.previous?.pose.rightArm.targets.wrist,
            boneLength: rightBoneLength,
            bodyScale,
            cameraQuality,
        }),
        head: createUnavailableJoint(),
        leftHand: createUnavailableJoint(),
        rightHand: createUnavailableJoint(),
    };
}

function createJointReliability(
    input: PoseReliabilityEstimatorInput,
    context: {
        point: SincroPoseTargetPointSnapshot;
        previousPoint?: SincroPoseTargetPointSnapshot;
        boneLength: ReliabilityScoreComponent;
        bodyScale: ReliabilityScoreComponent;
        cameraQuality: ReliabilityScoreComponent;
    },
): JointReliability {
    const components: ReliabilityComponentSet = {
        modelPresence: evaluateModelScalar(
            input.pose,
            context.point.presence,
            "model_presence_low",
        ),
        modelVisibility: evaluateModelScalar(
            input.pose,
            context.point.visibility,
            "model_visibility_low",
        ),
        tracking: evaluateTargetTracking(input.pose, context.point),
        border: evaluateBorder(context.point),
        boneLength: context.boneLength,
        bodyScale: context.bodyScale,
        temporal: evaluateTemporal(input, context.point, context.previousPoint),
        side: goodComponent(),
        roi: goodComponent(),
        cameraQuality: context.cameraQuality,
    };
    return createReliability("pose", components, isPoseTargetLost(input.pose, context.point));
}

function createParts(
    input: PoseReliabilityEstimatorInput,
    joints: ReliabilityMap["joints"],
    bodyScale: ReliabilityScoreComponent,
    cameraQuality: ReliabilityScoreComponent,
): ReliabilityMap["parts"] {
    return {
        torso: createTorsoPartReliability(input, joints, bodyScale, cameraQuality),
        head: createUnavailablePart(["head"]),
        leftArm: createArmPartReliability("left", input, joints, bodyScale, cameraQuality),
        rightArm: createArmPartReliability("right", input, joints, bodyScale, cameraQuality),
        leftHand: createUnavailablePart(["leftWrist", "leftHand"]),
        rightHand: createUnavailablePart(["rightWrist", "rightHand"]),
        leftFinger: createUnavailablePart(["leftHand"]),
        rightFinger: createUnavailablePart(["rightHand"]),
    };
}

function createTorsoPartReliability(
    input: PoseReliabilityEstimatorInput,
    joints: ReliabilityMap["joints"],
    bodyScale: ReliabilityScoreComponent,
    cameraQuality: ReliabilityScoreComponent,
): PartReliability {
    const leftHip = input.pose.lowerBodyTargets.leftHip;
    const rightHip = input.pose.lowerBodyTargets.rightHip;
    const components: ReliabilityComponentSet = {
        modelPresence: averageComponents([
            joints.leftShoulder.components.modelPresence,
            joints.rightShoulder.components.modelPresence,
            evaluateModelScalar(input.pose, leftHip.presence, "model_presence_low"),
            evaluateModelScalar(input.pose, rightHip.presence, "model_presence_low"),
        ]),
        modelVisibility: averageComponents([
            joints.leftShoulder.components.modelVisibility,
            joints.rightShoulder.components.modelVisibility,
            evaluateModelScalar(input.pose, leftHip.visibility, "model_visibility_low"),
            evaluateModelScalar(input.pose, rightHip.visibility, "model_visibility_low"),
        ]),
        tracking: input.pose.upperBody.hipCenterTracked
            ? averageComponents([
                  joints.leftShoulder.components.tracking,
                  joints.rightShoulder.components.tracking,
              ])
            : component(0.45, ["weak_tracking"]),
        border: averageComponents([
            joints.leftShoulder.components.border,
            joints.rightShoulder.components.border,
            evaluateBorder(leftHip),
            evaluateBorder(rightHip),
        ]),
        boneLength: goodComponent(),
        bodyScale,
        temporal: averageComponents([
            joints.leftShoulder.components.temporal,
            joints.rightShoulder.components.temporal,
        ]),
        side: goodComponent(),
        roi: goodComponent(),
        cameraQuality,
    };
    return {
        ...createReliability("pose", components, !input.pose.detected),
        joints: ["leftShoulder", "rightShoulder"],
    };
}

function createArmPartReliability(
    side: ArmSide,
    input: PoseReliabilityEstimatorInput,
    joints: ReliabilityMap["joints"],
    bodyScale: ReliabilityScoreComponent,
    cameraQuality: ReliabilityScoreComponent,
): PartReliability {
    const arm = side === "left" ? input.pose.leftArm : input.pose.rightArm;
    const names = armJointNames(side);
    const armJoints = names.map((name) => joints[name]);
    const components = averageComponentSets(armJoints.map((joint) => joint.components));
    components.tracking = arm.tracked
        ? averageComponents(armJoints.map((joint) => joint.components.tracking))
        : component(0, ["tracking_lost"]);
    components.bodyScale = bodyScale;
    components.cameraQuality = cameraQuality;
    return {
        ...createReliability(
            "pose",
            components,
            !input.pose.detected || armJoints.some((joint) => joint.state === "lost"),
        ),
        joints: names,
    };
}

function armJointNames(
    side: ArmSide,
): [ReliabilityJointName, ReliabilityJointName, ReliabilityJointName] {
    return side === "left"
        ? ["leftShoulder", "leftElbow", "leftWrist"]
        : ["rightShoulder", "rightElbow", "rightWrist"];
}
