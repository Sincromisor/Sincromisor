import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { expect } from "vitest";
import type { MinimalAvatarMotionProfile } from "../../avatarProfile/minimalAvatarMotionProfile";
import type { VrmPoseLayer, VrmPoseQuaternion } from "../vrmPoseTypes";

export const COMPLETE_PROFILE: MinimalAvatarMotionProfile = {
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
    measurements: {},
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

export function layer(
    input: Omit<VrmPoseLayer, "blendMode" | "weight"> & Partial<VrmPoseLayer>,
): VrmPoseLayer {
    return {
        blendMode: "override",
        weight: 1,
        ...input,
    };
}

export function eulerQuaternion(x: number, y: number, z: number): VrmPoseQuaternion {
    const quaternion = new Quaternion().setFromEuler(new Euler(x, y, z, "XYZ"));
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}

export function angleFromIdentity(value: VrmPoseQuaternion | undefined): number {
    if (!value) {
        return Number.NaN;
    }
    return new Quaternion(0, 0, 0, 1).angleTo(
        new Quaternion(value.x, value.y, value.z, value.w).normalize(),
    );
}

export function expectNormalizedQuaternion(
    received: VrmPoseQuaternion | undefined,
    expected: VrmPoseQuaternion,
): void {
    expect(received).toBeDefined();
    if (!received) {
        return;
    }
    const receivedQuaternion = new Quaternion(
        received.x,
        received.y,
        received.z,
        received.w,
    ).normalize();
    const expectedQuaternion = new Quaternion(
        expected.x,
        expected.y,
        expected.z,
        expected.w,
    ).normalize();
    expect(receivedQuaternion.angleTo(expectedQuaternion)).toBeLessThan(0.000001);
}
