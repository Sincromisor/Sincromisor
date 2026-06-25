import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import type { VrmPoseQuaternion } from "./vrmPoseTypes";

export const DEFAULT_ANGULAR_VELOCITY_LIMIT_DEG_PER_SEC = 720;
export const NORMALIZATION_EPSILON = 0.000001;

export function dampQuaternion(
    quaternion: VrmPoseQuaternion,
    shoulderDamping: number,
): VrmPoseQuaternion {
    return serializeQuaternion(
        identityQuaternion().slerp(
            deserializeQuaternion(quaternion).normalize(),
            MathUtils.clamp(shoulderDamping, 0, 1),
        ),
    );
}

export function weightedQuaternion(quaternion: VrmPoseQuaternion, weight: number): Quaternion {
    return identityQuaternion().slerp(
        deserializeQuaternion(quaternion).normalize(),
        MathUtils.clamp(weight, 0, 1),
    );
}

export function overrideQuaternion(
    current: Quaternion | undefined,
    quaternion: VrmPoseQuaternion,
    weight: number,
): Quaternion {
    if (!current) {
        if (weight >= 1) {
            return deserializeQuaternion(quaternion);
        }
        return weightedQuaternion(quaternion, weight);
    }
    return current
        .clone()
        .slerp(deserializeQuaternion(quaternion).normalize(), MathUtils.clamp(weight, 0, 1))
        .normalize();
}

export function additiveQuaternion(
    current: Quaternion | undefined,
    quaternion: VrmPoseQuaternion,
    weight: number,
): Quaternion {
    const base = current?.clone() ?? identityQuaternion();
    return base.multiply(weightedQuaternion(quaternion, weight)).normalize();
}

export function angularVelocityLimit(value: number | undefined): number {
    return value !== undefined && Number.isFinite(value) && value > 0
        ? value
        : DEFAULT_ANGULAR_VELOCITY_LIMIT_DEG_PER_SEC;
}

export function deserializeQuaternion(value: VrmPoseQuaternion): Quaternion {
    return new Quaternion(value.x, value.y, value.z, value.w);
}

export function serializeQuaternion(quaternion: Quaternion): VrmPoseQuaternion {
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}

function identityQuaternion(): Quaternion {
    return new Quaternion(0, 0, 0, 1);
}
