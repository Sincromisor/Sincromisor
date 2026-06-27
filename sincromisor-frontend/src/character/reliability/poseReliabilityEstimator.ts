import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type {
    SincroHandMotionSnapshot,
    SincroHandSideSnapshot,
} from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroPoseTargetPointSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { calculateRoiConsistency } from "../../features/gaze/trackingRuntime/roiTracking/roiCoordinateMapping";
import type {
    SincroRoiObservation,
    SincroRoiWarningCode,
} from "../../features/gaze/trackingRuntime/roiTracking/roiTrackingTypes";
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
    type ReliabilityReasonCode,
} from "./reliabilityMap";

export type { PoseReliabilityEstimatorInput } from "./poseReliabilityTypes";

const ROI_METADATA_FALLBACK_SCORE = 0.55;
const SIDE_INCONSISTENT_SCORE = 0.35;
const SIDE_INCONSISTENT_WEIGHT_CAP = 0.45;

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
        head: createHeadJointReliability(input, cameraQuality),
        leftHand: createHandJointReliability("left", input, cameraQuality),
        rightHand: createHandJointReliability("right", input, cameraQuality),
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
        head: createHeadPartReliability(input, joints),
        leftArm: createArmPartReliability("left", input, joints, bodyScale, cameraQuality),
        rightArm: createArmPartReliability("right", input, joints, bodyScale, cameraQuality),
        leftHand: createHandPartReliability("left", input, joints),
        rightHand: createHandPartReliability("right", input, joints),
        leftFinger: createFingerPartReliability("left", input, joints),
        rightFinger: createFingerPartReliability("right", input, joints),
    };
}

function createHeadJointReliability(
    input: PoseReliabilityEstimatorInput,
    cameraQuality: ReliabilityScoreComponent,
): JointReliability {
    if (!hasOwnInput(input, "face")) {
        return createUnavailableJoint();
    }
    const face = input.face;
    if (face === undefined || !face.detected) {
        return createLostFaceReliability(face, cameraQuality);
    }

    const confidence = finiteOrZero(face.confidence);
    const components: ReliabilityComponentSet = {
        modelPresence: component(confidence, confidence < 0.5 ? ["model_presence_low"] : []),
        modelVisibility: component(confidence, []),
        tracking:
            face.source === "lost" ? component(0, ["tracking_lost"]) : component(confidence, []),
        border: goodComponent(),
        boneLength: goodComponent(),
        bodyScale: goodComponent(),
        temporal: goodComponent(),
        side: goodComponent(),
        roi: createRoiMetadataComponent(face.roi),
        cameraQuality,
    };
    return createReliability("face", components, face.source === "lost");
}

function createLostFaceReliability(
    face: SincroFaceMotionSnapshot | undefined,
    cameraQuality: ReliabilityScoreComponent,
): JointReliability {
    const components: ReliabilityComponentSet = {
        modelPresence: component(0, ["no_observation"]),
        modelVisibility: component(0, ["no_observation"]),
        tracking: component(0, ["no_observation"]),
        border: goodComponent(),
        boneLength: goodComponent(),
        bodyScale: goodComponent(),
        temporal: goodComponent(),
        side: goodComponent(),
        roi:
            face === undefined
                ? component(0, ["no_observation"])
                : createRoiMetadataComponent(face.roi),
        cameraQuality,
    };
    return createReliability("face", components, true);
}

function createHandJointReliability(
    side: ArmSide,
    input: PoseReliabilityEstimatorInput,
    cameraQuality: ReliabilityScoreComponent,
): JointReliability {
    if (!hasOwnInput(input, "hand")) {
        return createUnavailableJoint();
    }
    const hand = handSide(input.hand, side);
    if (hand === undefined || !hand.detected) {
        return createLostHandReliability(hand, cameraQuality);
    }

    const confidence = finiteOrZero(hand.confidence);
    const components: ReliabilityComponentSet = {
        modelPresence: component(confidence, confidence < 0.5 ? ["model_presence_low"] : []),
        modelVisibility: component(confidence, []),
        tracking:
            hand.source === "lost" ? component(0, ["tracking_lost"]) : component(confidence, []),
        border: goodComponent(),
        boneLength: goodComponent(),
        bodyScale: goodComponent(),
        temporal: goodComponent(),
        side: hand.warnings.includes("side_inconsistent")
            ? component(SIDE_INCONSISTENT_SCORE, ["side_inconsistent"])
            : goodComponent(),
        roi: createHandRoiComponent(hand),
        cameraQuality,
    };
    return capSideInconsistentReliability(
        createReliability("hand", components, hand.source === "lost"),
        hand.warnings.includes("side_inconsistent"),
    );
}

function createLostHandReliability(
    hand: SincroHandSideSnapshot | undefined,
    cameraQuality: ReliabilityScoreComponent,
): JointReliability {
    const components: ReliabilityComponentSet = {
        modelPresence: component(0, ["no_observation"]),
        modelVisibility: component(0, ["no_observation"]),
        tracking: component(0, ["no_observation"]),
        border: goodComponent(),
        boneLength: goodComponent(),
        bodyScale: goodComponent(),
        temporal: goodComponent(),
        side: goodComponent(),
        roi:
            hand === undefined
                ? component(0, ["no_observation"])
                : createRoiMetadataComponent(hand.roi),
        cameraQuality,
    };
    return createReliability("hand", components, true);
}

function createHeadPartReliability(
    input: PoseReliabilityEstimatorInput,
    joints: ReliabilityMap["joints"],
): PartReliability {
    if (!hasOwnInput(input, "face")) {
        return createUnavailablePart(["head"]);
    }
    return {
        ...createReliability("face", joints.head.components, joints.head.state === "lost"),
        joints: ["head"],
    };
}

function createHandPartReliability(
    side: ArmSide,
    input: PoseReliabilityEstimatorInput,
    joints: ReliabilityMap["joints"],
): PartReliability {
    if (!hasOwnInput(input, "hand")) {
        return createUnavailablePart(handPartJointNames(side));
    }
    const handJoint = side === "left" ? joints.leftHand : joints.rightHand;
    const poseWrist =
        side === "left" ? input.pose.leftArm.targets.wrist : input.pose.rightArm.targets.wrist;
    return {
        ...createReliability(
            "hand",
            handJoint.components,
            handJoint.state === "lost" || isPoseTargetLost(input.pose, poseWrist),
        ),
        joints: handPartJointNames(side),
    };
}

function createFingerPartReliability(
    side: ArmSide,
    input: PoseReliabilityEstimatorInput,
    joints: ReliabilityMap["joints"],
): PartReliability {
    if (!hasOwnInput(input, "hand")) {
        return createUnavailablePart([handJointName(side)]);
    }
    const hand = handSide(input.hand, side);
    if (hand === undefined || hand.features.openness === "unknown") {
        return createLostFingerReliability(hand, side, joints);
    }

    const handPart =
        side === "left"
            ? createHandPartReliability("left", input, joints)
            : createHandPartReliability("right", input, joints);
    const finiteCurlScore = allFingerCurlFinite(hand) ? 1 : 0;
    const components: ReliabilityComponentSet = {
        ...handPart.components,
        tracking: component(finiteOrZero(hand.confidence), []),
        modelPresence: component(
            finiteCurlScore,
            finiteCurlScore < 0.5 ? ["model_presence_low"] : [],
        ),
    };
    const reliability = createReliability("hand", components, handPart.state === "lost");
    return {
        ...reliability,
        warnings: allFingerCurlFinite(hand)
            ? reliability.warnings
            : uniqueWarnings([...reliability.warnings, "low_confidence"]),
        joints: [handJointName(side)],
    };
}

function createLostFingerReliability(
    hand: SincroHandSideSnapshot | undefined,
    side: ArmSide,
    joints: ReliabilityMap["joints"],
): PartReliability {
    const handJoint = side === "left" ? joints.leftHand : joints.rightHand;
    const components: ReliabilityComponentSet = {
        modelPresence: component(0, ["no_observation"]),
        modelVisibility: component(0, ["no_observation"]),
        tracking: component(0, ["no_observation"]),
        border: goodComponent(),
        boneLength: goodComponent(),
        bodyScale: goodComponent(),
        temporal: goodComponent(),
        side: handJoint.components.side,
        roi:
            hand === undefined
                ? component(0, ["no_observation"])
                : createRoiMetadataComponent(hand.roi),
        cameraQuality: handJoint.components.cameraQuality,
    };
    return {
        ...createReliability("neutral", components, true),
        joints: [handJointName(side)],
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

function handPartJointNames(side: ArmSide): [ReliabilityJointName, ReliabilityJointName] {
    return side === "left" ? ["leftWrist", "leftHand"] : ["rightWrist", "rightHand"];
}

function handJointName(side: ArmSide): ReliabilityJointName {
    return side === "left" ? "leftHand" : "rightHand";
}

function handSide(
    snapshot: SincroHandMotionSnapshot | undefined,
    side: ArmSide,
): SincroHandSideSnapshot | undefined {
    if (snapshot === undefined) {
        return undefined;
    }
    return side === "left" ? snapshot.leftHand : snapshot.rightHand;
}

function createRoiMetadataComponent(
    roi: SincroRoiObservation | undefined,
): ReliabilityScoreComponent {
    if (roi === undefined) {
        return component(ROI_METADATA_FALLBACK_SCORE, ["not_available_in_pose_snapshot"]);
    }
    return component(roi.confidence, mapRoiWarnings(roi.warnings));
}

function createHandRoiComponent(hand: SincroHandSideSnapshot): ReliabilityScoreComponent {
    if (
        hand.roi === undefined ||
        hand.roi.referencePoint === undefined ||
        hand.fullFrameWrist === undefined
    ) {
        return component(ROI_METADATA_FALLBACK_SCORE, ["not_available_in_pose_snapshot"]);
    }
    const consistency = calculateRoiConsistency({
        expected: hand.roi.referencePoint,
        observed: hand.fullFrameWrist,
    });
    return component(
        consistency.score,
        mapRoiWarnings([...hand.roi.warnings, ...consistency.warnings]),
    );
}

export function mapRoiWarnings(warnings: readonly SincroRoiWarningCode[]): ReliabilityReasonCode[] {
    const reasons: ReliabilityReasonCode[] = [];
    for (const warning of warnings) {
        if (warning === "roi_missing") {
            reasons.push("roi_missing");
        }
        if (
            warning === "roi_inconsistent" ||
            warning === "roi_clamped" ||
            warning === "roi_too_small" ||
            warning === "low_pose_quality" ||
            warning === "invalid_pose_point"
        ) {
            reasons.push("roi_inconsistent");
        }
    }
    return [...new Set(reasons)];
}

function capSideInconsistentReliability(
    reliability: JointReliability,
    sideInconsistent: boolean,
): JointReliability {
    if (!sideInconsistent) {
        return reliability;
    }
    return {
        ...reliability,
        state: reliability.state === "tracked" ? "suspect" : reliability.state,
        finalWeight: Math.min(reliability.finalWeight, SIDE_INCONSISTENT_WEIGHT_CAP),
        warnings: uniqueWarnings([...reliability.warnings, "side_inconsistent", "low_confidence"]),
    };
}

function allFingerCurlFinite(hand: SincroHandSideSnapshot): boolean {
    const curl = hand.features.fingerCurl;
    return (
        isFiniteNumber(curl.thumb) &&
        isFiniteNumber(curl.index) &&
        isFiniteNumber(curl.middle) &&
        isFiniteNumber(curl.ring) &&
        isFiniteNumber(curl.little)
    );
}

function hasOwnInput(input: PoseReliabilityEstimatorInput, key: "hand" | "face"): boolean {
    return key in input;
}
