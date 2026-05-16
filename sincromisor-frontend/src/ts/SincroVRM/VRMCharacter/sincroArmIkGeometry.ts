import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import type { SincroArmSide } from "./SincroArmIkSolver";

export type SincroArmIkReachOptions = {
    minReachRatio: number;
    maxReachRatio: number;
    overheadMinReachRatio: number;
};

export type SincroArmIkClampedTarget = {
    target: Vector3;
    clamped: boolean;
};

export type SincroArmIkLimitedQuaternion = {
    quaternion: Quaternion;
    limited: boolean;
};

const MIN_DIRECTION_LENGTH = 1e-5;

export function targetDirectionIsUsable(direction: Vector3): boolean {
    return (
        Number.isFinite(direction.x) &&
        Number.isFinite(direction.y) &&
        Number.isFinite(direction.z) &&
        direction.lengthSq() > MIN_DIRECTION_LENGTH ** 2
    );
}

export function clampArmIkTarget(
    target: Vector3,
    upperArmLength: number,
    lowerArmLength: number,
    bindUpperDirection: Vector3,
    options: SincroArmIkReachOptions,
): SincroArmIkClampedTarget {
    const maxReach = (upperArmLength + lowerArmLength) * options.maxReachRatio;
    const minReach = Math.max(
        Math.abs(upperArmLength - lowerArmLength),
        (upperArmLength + lowerArmLength) * options.minReachRatio,
    );
    const reach = target.length();
    const clampedReach = MathUtils.clamp(
        reach,
        Math.max(minReach, overheadMinReach(target, maxReach, options.overheadMinReachRatio)),
        maxReach,
    );
    if (reach <= MIN_DIRECTION_LENGTH) {
        return {
            target: bindUpperDirection.clone().multiplyScalar(minReach),
            clamped: true,
        };
    }
    return {
        target: target.clone().multiplyScalar(clampedReach / reach),
        clamped: Math.abs(clampedReach - reach) > 1e-4,
    };
}

export function elbowPosition(
    target: Vector3,
    poleDirection: Vector3,
    upperArmLength: number,
    lowerArmLength: number,
): Vector3 {
    const reach = Math.max(target.length(), MIN_DIRECTION_LENGTH);
    const targetDirection = target.clone().multiplyScalar(1 / reach);
    const shoulderToElbow = (upperArmLength ** 2 - lowerArmLength ** 2 + reach ** 2) / (2 * reach);
    const elbowHeight = Math.sqrt(Math.max(upperArmLength ** 2 - shoulderToElbow ** 2, 0));
    return targetDirection
        .multiplyScalar(shoulderToElbow)
        .add(poleDirection.clone().multiplyScalar(elbowHeight));
}

export function localQuaternionFromParentDirection(
    bindDirection: Vector3,
    desiredDirection: Vector3,
    neutralQuaternion: Quaternion,
    maxDeltaRad: number,
): SincroArmIkLimitedQuaternion {
    const deltaQuaternion = new Quaternion().setFromUnitVectors(
        bindDirection.clone().normalize(),
        desiredDirection.clone().normalize(),
    );
    const solvedQuaternion = neutralQuaternion.clone().premultiply(deltaQuaternion);
    const deltaRad = neutralQuaternion.angleTo(solvedQuaternion);
    if (deltaRad <= maxDeltaRad) {
        return { quaternion: solvedQuaternion.normalize(), limited: false };
    }
    return {
        quaternion: neutralQuaternion
            .clone()
            .slerp(solvedQuaternion, maxDeltaRad / Math.max(deltaRad, MIN_DIRECTION_LENGTH))
            .normalize(),
        limited: true,
    };
}

export function bindPoleFromArm(
    side: SincroArmSide,
    shoulder: Vector3,
    elbow: Vector3,
    hand: Vector3,
): Vector3 {
    const targetDirection = hand.clone().sub(shoulder).normalize();
    const elbowPole = elbow
        .clone()
        .sub(shoulder)
        .sub(
            targetDirection
                .clone()
                .multiplyScalar(elbow.clone().sub(shoulder).dot(targetDirection)),
        );
    if (targetDirectionIsUsable(elbowPole)) {
        return elbowPole.normalize();
    }
    return side === "left" ? new Vector3(-1, 0, 0) : new Vector3(1, 0, 0);
}

export function directionInWorldQuaternionSpace(
    worldQuaternion: Quaternion,
    direction: Vector3,
): Vector3 {
    return direction.clone().applyQuaternion(worldQuaternion.clone().invert()).normalize();
}

export function serializeQuaternion(quaternion: Quaternion): {
    x: number;
    y: number;
    z: number;
    w: number;
} {
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}

function overheadMinReach(
    target: Vector3,
    maxReach: number,
    overheadMinReachRatio: number,
): number {
    const reach = target.length();
    if (reach <= MIN_DIRECTION_LENGTH) {
        return 0;
    }
    const upwardRatio = target.y / reach;
    const overheadWeight = MathUtils.smoothstep(upwardRatio, 0.48, 0.82);
    return overheadWeight > 0 ? maxReach * overheadMinReachRatio * overheadWeight : 0;
}
