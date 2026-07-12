import { Quaternion } from "three/src/math/Quaternion.js";
import {
    cloneSincroHandMotionSnapshot,
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandFeatureSnapshot,
    type SincroHandMotionSnapshot,
} from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { AvatarMotionProfile } from "../../avatarProfile/avatarMotionProfile";
import type { FingerCurlPoseDebugSnapshot } from "../fingerCurlPoseLayer";
import {
    type ArmMotionIntent,
    createDefaultMotionIntentState,
    type MotionIntentState,
} from "../motionIntentState";

export const PROFILE: AvatarMotionProfile = {
    schemaVersion: "sincro.avatar-motion-profile.v1",
    model: { vrmVersion: "1.0", modelName: "test" },
    capabilities: {
        bones: {
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
        fingerChains: fullFingerChains(),
    },
    restLocalRotation: {},
    metrics: {
        shoulderWidth: 0.32,
        torsoLength: 0.52,
        headSize: 0.16,
        upperArmLength: { left: 0.24, right: 0.24 },
        lowerArmLength: { left: 0.22, right: 0.22 },
        handSize: { left: 0.08, right: 0.08 },
    },
    torso: { distribution: { spine: 0.25, chest: 0.4, upperChest: 0.35 }, chestFollow: 0.55 },
    arm: {
        reachScale: 0.9,
        lateralScale: 0.9,
        verticalScale: 0.95,
        depthCompression: 0.6,
        elbowOutwardBias: 0.25,
        shoulderDamping: 0.55,
    },
    wrist: { wristRollInfluence: 0.4, lowerArmTwistShare: 0.65, handTwistShare: 0.35 },
    fingers: {
        curlScale: 1,
        curlMode: "grouped",
        curlDistribution: { proximal: 0.5, intermediate: 0.3, distal: 0.2 },
        splayLimitDeg: 12,
    },
    risk: {
        smallBodyLargeHead: 0,
        missingUpperChest: false,
        missingShoulders: false,
        constraintRisk: 0,
    },
    warnings: [],
};

export function createProfile(
    input: {
        curlScale?: number;
        curlDistribution?: AvatarMotionProfile["fingers"]["curlDistribution"];
        chains?: AvatarMotionProfile["capabilities"]["fingerChains"];
    } = {},
): AvatarMotionProfile {
    return {
        ...PROFILE,
        capabilities: {
            ...PROFILE.capabilities,
            fingerChains: input.chains ?? fullFingerChains(),
        },
        fingers: {
            ...PROFILE.fingers,
            curlScale: input.curlScale ?? PROFILE.fingers.curlScale,
            curlDistribution: input.curlDistribution ?? { ...PROFILE.fingers.curlDistribution },
        },
    };
}

export function createHand(
    curl: Partial<SincroHandFeatureSnapshot["fingerCurl"]> = {},
): SincroHandMotionSnapshot {
    const hand = cloneSincroHandMotionSnapshot(DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT);
    hand.trackingEnabled = true;
    hand.detected = true;
    hand.leftHand.detected = true;
    hand.leftHand.source = "roi";
    hand.leftHand.confidence = 1;
    hand.leftHand.features.fingerCurl = { ...hand.leftHand.features.fingerCurl, ...curl };
    hand.leftHand.features.fingerSplay = { indexMiddle: 0, middleRing: 0, ringLittle: 0 };
    hand.leftHand.features.thumbOppose = 0;
    hand.rightHand = { ...hand.leftHand, assignedSide: "right" };
    return hand;
}

export function createIntent(intent: ArmMotionIntent = "tracking"): MotionIntentState {
    const state = createDefaultMotionIntentState(1000);
    state.arms.left = {
        ...state.arms.left,
        intent,
        confidence: 1,
        reliability: 1,
        expressiveness: 1,
        source: "gesture",
        warnings: [],
    };
    state.warnings = [];
    return state;
}

export function previousDebug(
    side: "left" | "right",
    mediaTimeMs: number,
    curl: number,
): FingerCurlPoseDebugSnapshot {
    const groups: FingerCurlPoseDebugSnapshot["groups"][number]["group"][] = [
        "thumb",
        "index",
        "middle",
        "ringLittle",
    ];
    return {
        schemaVersion: "sincro.phase9-finger-curl-pose.v1",
        side,
        timestamp: { mediaTimeMs },
        groups: groups.map((group) => ({
            group,
            curl,
            source: "hand",
            warnings: [],
        })),
        ownedBones: [],
        warnings: [],
    };
}

export function groupCurl(
    debug: FingerCurlPoseDebugSnapshot,
    group: FingerCurlPoseDebugSnapshot["groups"][number]["group"],
): number {
    return debug.groups.find((state) => state.group === group)?.curl ?? Number.NaN;
}

export function setAllCurls(features: SincroHandFeatureSnapshot, value: number): void {
    features.fingerCurl = {
        thumb: value,
        index: value,
        middle: value,
        ring: value,
        little: value,
    };
}

export function angleFromIdentity(
    value: { x: number; y: number; z: number; w: number } | undefined,
): number {
    if (value === undefined) {
        return Number.NaN;
    }
    return new Quaternion(0, 0, 0, 1).angleTo(
        new Quaternion(value.x, value.y, value.z, value.w).normalize(),
    );
}

export function emptyFingerChains(): AvatarMotionProfile["capabilities"]["fingerChains"] {
    return {
        left: emptySideFingerChains(),
        right: emptySideFingerChains(),
    };
}

function fullFingerChains(): AvatarMotionProfile["capabilities"]["fingerChains"] {
    return {
        left: fullSideFingerChains(),
        right: fullSideFingerChains(),
    };
}

function fullSideFingerChains(): AvatarMotionProfile["capabilities"]["fingerChains"]["left"] {
    return {
        thumb: { proximal: true, intermediate: true, distal: true },
        index: { proximal: true, intermediate: true, distal: true },
        middle: { proximal: true, intermediate: true, distal: true },
        ring: { proximal: true, intermediate: true, distal: true },
        little: { proximal: true, intermediate: true, distal: true },
    };
}

function emptySideFingerChains(): AvatarMotionProfile["capabilities"]["fingerChains"]["left"] {
    return {
        thumb: { proximal: false, intermediate: false, distal: false },
        index: { proximal: false, intermediate: false, distal: false },
        middle: { proximal: false, intermediate: false, distal: false },
        ring: { proximal: false, intermediate: false, distal: false },
        little: { proximal: false, intermediate: false, distal: false },
    };
}
