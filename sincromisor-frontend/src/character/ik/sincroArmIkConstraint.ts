import { MathUtils } from "three/src/math/MathUtils.js";
import { Vector3 } from "three/src/math/Vector3.js";
import type { ArmPoleState } from "./sincroArmIkPole";
import type { SincroArmSide } from "./sincroArmIkTypes";

export type SincroArmIkConstraintSnapshot = {
    reasons: string[];
    jointLimited: boolean;
    poleStabilized: boolean;
    collisionAvoided: boolean;
    weightScale: number;
    targetPushDistance: number;
    poleState?: ArmPoleState;
    reasonCodes?: string[];
    angularVelocityClamped?: boolean;
    wristRollDamped?: boolean;
    wristRollInfluence?: number;
};

export type SincroArmIkConstraintOptions = {
    minShoulderOpenRatio: number;
    maxShoulderOpenRatio: number;
    minShoulderLiftRatio: number;
    maxShoulderLiftRatio: number;
    maxShoulderDepthRatio: number;
    headRadiusRatio: number;
    chestRadiusXRatio: number;
    chestRadiusYRatio: number;
    chestRadiusZRatio: number;
    handRadiusRatio: number;
    forearmRadiusRatio: number;
    collisionWeightScale: number;
    jointLimitWeightScale: number;
    poleStabilizedWeightScale: number;
};

export const DEFAULT_SINCRO_ARM_IK_CONSTRAINT_OPTIONS: SincroArmIkConstraintOptions = {
    minShoulderOpenRatio: -0.34,
    maxShoulderOpenRatio: 0.97,
    minShoulderLiftRatio: -0.62,
    maxShoulderLiftRatio: 0.99,
    maxShoulderDepthRatio: 0.78,
    headRadiusRatio: 0.38,
    chestRadiusXRatio: 0.56,
    chestRadiusYRatio: 0.72,
    chestRadiusZRatio: 0.42,
    handRadiusRatio: 0.18,
    forearmRadiusRatio: 0.14,
    collisionWeightScale: 0.78,
    jointLimitWeightScale: 0.9,
    poleStabilizedWeightScale: 0.94,
};

const MIN_DIRECTION_LENGTH = 1e-5;

type TargetConstraintResult = {
    target: Vector3;
    limited: boolean;
};

type TargetAvoidanceResult = {
    target: Vector3;
    reason?: string;
    pushDistance: number;
};

type SincroArmIkConstraintResolverOptions = {
    side: SincroArmSide;
    shoulderWidth: number;
    bindPoleDirection: Vector3;
    headCenterFromShoulder?: Vector3;
    chestCenterFromShoulder?: Vector3;
    options?: SincroArmIkConstraintOptions;
};

// Applies model-side safety constraints after tracking gates have accepted a target.
export class SincroArmIkConstraintResolver {
    private readonly side: SincroArmSide;
    private readonly shoulderWidth: number;
    private readonly bindPoleDirection: Vector3;
    private readonly headCenterFromShoulder?: Vector3;
    private readonly chestCenterFromShoulder?: Vector3;
    private readonly options: SincroArmIkConstraintOptions;

    constructor(options: SincroArmIkConstraintResolverOptions) {
        this.side = options.side;
        this.shoulderWidth = options.shoulderWidth;
        this.bindPoleDirection = options.bindPoleDirection;
        this.headCenterFromShoulder = options.headCenterFromShoulder;
        this.chestCenterFromShoulder = options.chestCenterFromShoulder;
        this.options = options.options ?? DEFAULT_SINCRO_ARM_IK_CONSTRAINT_OPTIONS;
    }

    constrainShoulderTarget(target: Vector3): TargetConstraintResult {
        const reach = target.length();
        if (reach <= MIN_DIRECTION_LENGTH) {
            return { target, limited: false };
        }
        const sideSign = this.side === "left" ? -1 : 1;
        const open = (target.x * sideSign) / reach;
        const lift = target.y / reach;
        const depth = target.z / reach;
        const clampedOpen = MathUtils.clamp(
            open,
            this.options.minShoulderOpenRatio,
            this.options.maxShoulderOpenRatio,
        );
        const clampedLift = MathUtils.clamp(
            lift,
            this.options.minShoulderLiftRatio,
            this.options.maxShoulderLiftRatio,
        );
        const clampedDepth = MathUtils.clamp(
            depth,
            -this.options.maxShoulderDepthRatio,
            this.options.maxShoulderDepthRatio,
        );
        const constrained = new Vector3(clampedOpen * sideSign, clampedLift, clampedDepth)
            .normalize()
            .multiplyScalar(reach);
        return {
            target: constrained,
            limited:
                Math.abs(clampedOpen - open) > 1e-4 ||
                Math.abs(clampedLift - lift) > 1e-4 ||
                Math.abs(clampedDepth - depth) > 1e-4,
        };
    }

    avoidNoGoZones(target: Vector3): TargetAvoidanceResult {
        const headAvoidance = this.pushPointOutOfSphere(
            target,
            this.headCenterFromShoulder,
            (this.options.headRadiusRatio + this.options.handRadiusRatio) * this.shoulderWidth,
            "head_collision_avoided",
        );
        const chestAvoidance = this.pushPointOutOfEllipsoid(
            headAvoidance.target,
            this.chestCenterFromShoulder,
            this.chestRadii(),
            "chest_no_go_zone",
        );
        return {
            target: chestAvoidance.target,
            reason: headAvoidance.reason ?? chestAvoidance.reason,
            pushDistance: headAvoidance.pushDistance + chestAvoidance.pushDistance,
        };
    }

    forearmCollisionReason(elbow: Vector3, wrist: Vector3): string | undefined {
        const forearmHeadRadius =
            (this.options.headRadiusRatio + this.options.forearmRadiusRatio) * this.shoulderWidth;
        if (
            this.segmentIntersectsSphere(
                elbow,
                wrist,
                this.headCenterFromShoulder,
                forearmHeadRadius,
            )
        ) {
            return "head_collision_avoided";
        }
        if (
            this.segmentIntersectsEllipsoid(
                elbow,
                wrist,
                this.chestCenterFromShoulder,
                this.chestRadii(),
            )
        ) {
            return "chest_no_go_zone";
        }
        return undefined;
    }

    constraintWeightScale(
        jointLimited: boolean,
        poleStabilized: boolean,
        collisionAvoided: boolean,
    ): number {
        let weightScale = 1;
        if (jointLimited) {
            weightScale *= this.options.jointLimitWeightScale;
        }
        if (poleStabilized) {
            weightScale *= this.options.poleStabilizedWeightScale;
        }
        if (collisionAvoided) {
            weightScale *= this.options.collisionWeightScale;
        }
        return MathUtils.clamp(weightScale, 0, 1);
    }

    private chestRadii(): Vector3 {
        return new Vector3(
            this.options.chestRadiusXRatio * this.shoulderWidth,
            this.options.chestRadiusYRatio * this.shoulderWidth,
            this.options.chestRadiusZRatio * this.shoulderWidth,
        );
    }

    private pushPointOutOfSphere(
        target: Vector3,
        center: Vector3 | undefined,
        radius: number,
        reason: string,
    ): TargetAvoidanceResult {
        if (!center) {
            return { target, pushDistance: 0 };
        }
        const fromCenter = target.clone().sub(center);
        const distance = fromCenter.length();
        if (distance >= radius) {
            return { target, pushDistance: 0 };
        }
        const direction = targetDirectionIsUsable(fromCenter)
            ? fromCenter.normalize()
            : this.bindPoleDirection.clone().normalize();
        const pushed = center.clone().add(direction.multiplyScalar(radius));
        return { target: pushed, reason, pushDistance: radius - distance };
    }

    private pushPointOutOfEllipsoid(
        target: Vector3,
        center: Vector3 | undefined,
        radii: Vector3,
        reason: string,
    ): TargetAvoidanceResult {
        if (!center || radii.x <= 0 || radii.y <= 0 || radii.z <= 0) {
            return { target, pushDistance: 0 };
        }
        const offset = target.clone().sub(center);
        const scaledLength = Math.hypot(offset.x / radii.x, offset.y / radii.y, offset.z / radii.z);
        if (scaledLength >= 1) {
            return { target, pushDistance: 0 };
        }
        const direction = targetDirectionIsUsable(offset)
            ? offset.multiplyScalar(1 / Math.max(scaledLength, MIN_DIRECTION_LENGTH))
            : this.bindPoleDirection.clone();
        const pushed = center.clone().add(direction);
        return { target: pushed, reason, pushDistance: target.distanceTo(pushed) };
    }

    private segmentIntersectsSphere(
        start: Vector3,
        end: Vector3,
        center: Vector3 | undefined,
        radius: number,
    ): boolean {
        if (!center) {
            return false;
        }
        return closestPointOnSegment(start, end, center).distanceTo(center) < radius;
    }

    private segmentIntersectsEllipsoid(
        start: Vector3,
        end: Vector3,
        center: Vector3 | undefined,
        radii: Vector3,
    ): boolean {
        if (!center || radii.x <= 0 || radii.y <= 0 || radii.z <= 0) {
            return false;
        }
        const scaledStart = scaleFromCenter(start, center, radii);
        const scaledEnd = scaleFromCenter(end, center, radii);
        return closestPointOnSegment(scaledStart, scaledEnd, new Vector3()).lengthSq() < 1;
    }
}

function targetDirectionIsUsable(direction: Vector3): boolean {
    return (
        Number.isFinite(direction.x) &&
        Number.isFinite(direction.y) &&
        Number.isFinite(direction.z) &&
        direction.lengthSq() > MIN_DIRECTION_LENGTH ** 2
    );
}

function closestPointOnSegment(start: Vector3, end: Vector3, point: Vector3): Vector3 {
    const segment = end.clone().sub(start);
    const lengthSq = segment.lengthSq();
    if (lengthSq <= MIN_DIRECTION_LENGTH ** 2) {
        return start.clone();
    }
    const t = MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
    return start.clone().add(segment.multiplyScalar(t));
}

function scaleFromCenter(point: Vector3, center: Vector3, radii: Vector3): Vector3 {
    return new Vector3(
        (point.x - center.x) / radii.x,
        (point.y - center.y) / radii.y,
        (point.z - center.z) / radii.z,
    );
}
