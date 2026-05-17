import { Vector3 } from "three/src/math/Vector3.js";
import { targetDirectionIsUsable } from "./sincroArmIkGeometry";

export type SincroArmIkElbowPole = {
    direction: Vector3;
    stabilized: boolean;
};

type SincroArmIkPoleDirectionOptions = {
    elbowPole: Vector3;
    target: Vector3;
    bindPoleDirection: Vector3;
    lastPoleDirection?: Vector3;
    poleFlipDotThreshold: number;
};

export function resolveArmIkPoleDirection({
    elbowPole,
    target,
    bindPoleDirection,
    lastPoleDirection,
    poleFlipDotThreshold,
}: SincroArmIkPoleDirectionOptions): SincroArmIkElbowPole {
    const targetDirection = target.clone().normalize();
    const pole = elbowPole
        .clone()
        .sub(targetDirection.clone().multiplyScalar(elbowPole.dot(targetDirection)));
    if (targetDirectionIsUsable(pole)) {
        return stabilizePoleDirection({
            candidate: pole.normalize(),
            targetDirection,
            bindPoleDirection,
            lastPoleDirection,
            poleFlipDotThreshold,
        });
    }
    const fallbackPole = bindPoleDirection
        .clone()
        .sub(targetDirection.clone().multiplyScalar(bindPoleDirection.dot(targetDirection)));
    const direction = targetDirectionIsUsable(fallbackPole)
        ? fallbackPole.normalize()
        : new Vector3(0, 1, 0);
    return { direction, stabilized: true };
}

type StabilizePoleDirectionOptions = {
    candidate: Vector3;
    targetDirection: Vector3;
    bindPoleDirection: Vector3;
    lastPoleDirection?: Vector3;
    poleFlipDotThreshold: number;
};

function stabilizePoleDirection({
    candidate,
    targetDirection,
    bindPoleDirection,
    lastPoleDirection,
    poleFlipDotThreshold,
}: StabilizePoleDirectionOptions): SincroArmIkElbowPole {
    const fallback = lastPoleDirection ?? bindPoleDirection;
    const projectedFallback = fallback
        .clone()
        .sub(targetDirection.clone().multiplyScalar(fallback.dot(targetDirection)));
    if (!targetDirectionIsUsable(projectedFallback)) {
        return { direction: candidate, stabilized: false };
    }
    if (candidate.dot(projectedFallback.normalize()) >= poleFlipDotThreshold) {
        return { direction: candidate, stabilized: false };
    }
    return { direction: projectedFallback.normalize(), stabilized: true };
}
