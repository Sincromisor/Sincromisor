import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import {
    SincroArmIkConstraintResolver,
    type SincroArmIkConstraintSnapshot,
} from "./sincroArmIkConstraint";
import {
    bindPoleFromArm,
    clampArmIkTarget,
    directionInWorldQuaternionSpace,
    elbowPosition,
    localQuaternionFromParentDirection,
    type SincroArmIkClampedTarget,
    type SincroArmIkLimitedQuaternion,
    serializeQuaternion,
    targetDirectionIsUsable,
} from "./sincroArmIkGeometry";

export type SincroArmSide = "left" | "right";

export type SincroArmIkTarget = {
    wrist: Vector3;
    elbowPole: Vector3;
    weight: number;
};

export type SincroArmIkQuaternion = {
    x: number;
    y: number;
    z: number;
    w: number;
};

export type SincroArmIkSolveResult = {
    upperArmQuaternion: SincroArmIkQuaternion;
    lowerArmQuaternion: SincroArmIkQuaternion;
    neutralUpperArmQuaternion: SincroArmIkQuaternion;
    neutralLowerArmQuaternion: SincroArmIkQuaternion;
    targetClamped: boolean;
    constraint: SincroArmIkConstraintSnapshot;
    weight: number;
};

type SincroArmIkOptions = {
    maxUpperArmDeltaRad: number;
    maxLowerArmDeltaRad: number;
    minReachRatio: number;
    maxReachRatio: number;
    overheadMinReachRatio: number;
    poleFlipDotThreshold: number;
};

type SincroArmIkElbowPole = {
    direction: Vector3;
    stabilized: boolean;
};

type SincroArmIkPreparedTarget = {
    targetConstraint: ReturnType<SincroArmIkConstraintResolver["constrainShoulderTarget"]>;
    targetCollision: ReturnType<SincroArmIkConstraintResolver["avoidNoGoZones"]>;
    targetClamp: SincroArmIkClampedTarget;
    elbowPole: SincroArmIkElbowPole;
    elbow: Vector3;
    upperDirection: Vector3;
    lowerDirection: Vector3;
};

type SincroArmIkSolvedQuaternions = {
    upperLocalQuaternion: SincroArmIkLimitedQuaternion;
    lowerLocalQuaternion: SincroArmIkLimitedQuaternion;
};

type SincroArmIkConstraintResult = {
    constraint: SincroArmIkConstraintSnapshot;
    weightScale: number;
};

type SincroArmIkConstraintResultOptions = {
    targetConstraint: ReturnType<SincroArmIkConstraintResolver["constrainShoulderTarget"]>;
    targetCollision: ReturnType<SincroArmIkConstraintResolver["avoidNoGoZones"]>;
    elbowPole: SincroArmIkElbowPole;
    upperLocalQuaternion: SincroArmIkLimitedQuaternion;
    lowerLocalQuaternion: SincroArmIkLimitedQuaternion;
    forearmCollision: ReturnType<SincroArmIkConstraintResolver["forearmCollisionReason"]>;
};

const DEFAULT_OPTIONS: SincroArmIkOptions = {
    maxUpperArmDeltaRad: MathUtils.degToRad(142),
    maxLowerArmDeltaRad: MathUtils.degToRad(132),
    minReachRatio: 0.2,
    maxReachRatio: 0.985,
    overheadMinReachRatio: 0.9,
    poleFlipDotThreshold: -0.08,
};

// VRM normalized bone の現在姿勢を基準姿勢として測定し、MediaPipe 由来の肩相対 target を
// upper/lower arm の local quaternion に変換する two-bone solver。
export class SincroArmIkSolver {
    readonly side: SincroArmSide;
    readonly upperArmLength: number;
    readonly lowerArmLength: number;
    readonly shoulderWidth: number;

    private readonly upperArmNode: Object3D;
    private readonly neutralUpperArmQuaternion: Quaternion;
    private readonly neutralLowerArmQuaternion: Quaternion;
    private readonly bindUpperDirectionInParent: Vector3;
    private readonly bindLowerDirectionInUpper: Vector3;
    private readonly bindPoleDirection: Vector3;
    private readonly constraintResolver: SincroArmIkConstraintResolver;
    private readonly options: SincroArmIkOptions;
    private lastPoleDirection?: Vector3;

    static fromVrm(vrm: VRM, side: SincroArmSide): SincroArmIkSolver | undefined {
        vrm.scene.updateMatrixWorld(true);
        const upperArmNode = getNode(vrm, `${side}UpperArm` as VRMHumanBoneName);
        const lowerArmNode = getNode(vrm, `${side}LowerArm` as VRMHumanBoneName);
        const handNode = getNode(vrm, `${side}Hand` as VRMHumanBoneName);
        const headNode = getNode(vrm, "head" as VRMHumanBoneName);
        const chestNode = firstNode(vrm, [
            "upperChest" as VRMHumanBoneName,
            "chest" as VRMHumanBoneName,
            "spine" as VRMHumanBoneName,
        ]);
        const oppositeUpperArmNode = getNode(
            vrm,
            `${side === "left" ? "right" : "left"}UpperArm` as VRMHumanBoneName,
        );
        if (!upperArmNode || !lowerArmNode || !handNode || !oppositeUpperArmNode) {
            return undefined;
        }
        return new SincroArmIkSolver(
            side,
            upperArmNode,
            lowerArmNode,
            handNode,
            oppositeUpperArmNode,
            headNode,
            chestNode,
            DEFAULT_OPTIONS,
        );
    }

    private constructor(
        side: SincroArmSide,
        upperArmNode: Object3D,
        lowerArmNode: Object3D,
        handNode: Object3D,
        oppositeUpperArmNode: Object3D,
        headNode: Object3D | undefined,
        chestNode: Object3D | undefined,
        options: SincroArmIkOptions,
    ) {
        this.side = side;
        this.upperArmNode = upperArmNode;
        this.neutralUpperArmQuaternion = upperArmNode.quaternion.clone();
        this.neutralLowerArmQuaternion = lowerArmNode.quaternion.clone();
        this.options = options;

        const shoulder = this.worldPosition(upperArmNode);
        const elbow = this.worldPosition(lowerArmNode);
        const hand = this.worldPosition(handNode);
        const oppositeShoulder = this.worldPosition(oppositeUpperArmNode);
        this.upperArmLength = Math.max(shoulder.distanceTo(elbow), 0.04);
        this.lowerArmLength = Math.max(elbow.distanceTo(hand), 0.04);
        this.shoulderWidth = Math.max(shoulder.distanceTo(oppositeShoulder), 0.08);

        this.bindUpperDirectionInParent = this.directionInParentSpace(
            upperArmNode,
            elbow.clone().sub(shoulder),
        );
        this.bindLowerDirectionInUpper = directionInWorldQuaternionSpace(
            upperArmNode.getWorldQuaternion(new Quaternion()),
            hand.clone().sub(elbow),
        );
        this.bindPoleDirection = bindPoleFromArm(side, shoulder, elbow, hand);
        this.constraintResolver = new SincroArmIkConstraintResolver({
            side,
            shoulderWidth: this.shoulderWidth,
            bindPoleDirection: this.bindPoleDirection,
            headCenterFromShoulder: headNode
                ? this.worldPosition(headNode).sub(shoulder)
                : undefined,
            chestCenterFromShoulder: chestNode
                ? this.worldPosition(chestNode).sub(shoulder)
                : undefined,
        });
    }

    solve(target: SincroArmIkTarget): SincroArmIkSolveResult | undefined {
        if (!targetDirectionIsUsable(target.wrist)) {
            return undefined;
        }

        this.upperArmNode.parent?.updateMatrixWorld(true);
        this.upperArmNode.updateMatrixWorld(true);
        const prepared = this.prepareTarget(target);
        if (!prepared) {
            return undefined;
        }

        const solved = this.solveLocalQuaternions(prepared);
        const forearmCollision = this.constraintResolver.forearmCollisionReason(
            prepared.elbow,
            prepared.targetClamp.target,
        );
        const constraintResult = this.buildConstraintResult({
            targetConstraint: prepared.targetConstraint,
            targetCollision: prepared.targetCollision,
            elbowPole: prepared.elbowPole,
            upperLocalQuaternion: solved.upperLocalQuaternion,
            lowerLocalQuaternion: solved.lowerLocalQuaternion,
            forearmCollision,
        });
        this.lastPoleDirection = prepared.elbowPole.direction.clone();

        return {
            upperArmQuaternion: serializeQuaternion(solved.upperLocalQuaternion.quaternion),
            lowerArmQuaternion: serializeQuaternion(solved.lowerLocalQuaternion.quaternion),
            neutralUpperArmQuaternion: serializeQuaternion(this.neutralUpperArmQuaternion),
            neutralLowerArmQuaternion: serializeQuaternion(this.neutralLowerArmQuaternion),
            targetClamped: prepared.targetClamp.clamped,
            constraint: constraintResult.constraint,
            weight: MathUtils.clamp(target.weight, 0, 1) * constraintResult.weightScale,
        };
    }

    private prepareTarget(target: SincroArmIkTarget): SincroArmIkPreparedTarget | undefined {
        const targetVector = target.wrist.clone();
        const targetConstraint = this.constraintResolver.constrainShoulderTarget(targetVector);
        const targetCollision = this.constraintResolver.avoidNoGoZones(targetConstraint.target);
        const targetClamp = clampArmIkTarget({
            target: targetCollision.target,
            upperArmLength: this.upperArmLength,
            lowerArmLength: this.lowerArmLength,
            bindUpperDirection: this.bindUpperDirectionInParent,
            options: this.options,
        });
        const elbowPole = this.poleDirection(target.elbowPole, targetClamp.target);
        const elbow = elbowPosition(
            targetClamp.target,
            elbowPole.direction,
            this.upperArmLength,
            this.lowerArmLength,
        );
        const upperDirection = elbow.clone().normalize();
        const lowerDirection = targetClamp.target.clone().sub(elbow).normalize();
        if (!targetDirectionIsUsable(upperDirection) || !targetDirectionIsUsable(lowerDirection)) {
            return undefined;
        }
        return {
            targetConstraint,
            targetCollision,
            targetClamp,
            elbowPole,
            elbow,
            upperDirection,
            lowerDirection,
        };
    }

    private solveLocalQuaternions({
        upperDirection,
        lowerDirection,
    }: SincroArmIkPreparedTarget): SincroArmIkSolvedQuaternions {
        const parentWorldQuaternion = this.parentWorldQuaternion();
        const upperLocalQuaternion = localQuaternionFromParentDirection(
            this.bindUpperDirectionInParent,
            directionInWorldQuaternionSpace(parentWorldQuaternion, upperDirection),
            this.neutralUpperArmQuaternion,
            this.options.maxUpperArmDeltaRad,
        );
        const upperSolvedWorldQuaternion = parentWorldQuaternion
            .clone()
            .multiply(upperLocalQuaternion.quaternion);
        return {
            upperLocalQuaternion,
            lowerLocalQuaternion: localQuaternionFromParentDirection(
                this.bindLowerDirectionInUpper,
                directionInWorldQuaternionSpace(upperSolvedWorldQuaternion, lowerDirection),
                this.neutralLowerArmQuaternion,
                this.options.maxLowerArmDeltaRad,
            ),
        };
    }

    private buildConstraintResult({
        targetConstraint,
        targetCollision,
        elbowPole,
        upperLocalQuaternion,
        lowerLocalQuaternion,
        forearmCollision,
    }: SincroArmIkConstraintResultOptions): SincroArmIkConstraintResult {
        const reasons = [
            ...(targetConstraint.limited ? ["joint_limited"] : []),
            ...(targetCollision.reason ? [targetCollision.reason] : []),
            ...(elbowPole.stabilized ? ["elbow_pole_stabilized"] : []),
            ...(upperLocalQuaternion.limited ? ["joint_limited"] : []),
            ...(lowerLocalQuaternion.limited ? ["forearm_twist_limited"] : []),
            ...(forearmCollision ? [forearmCollision] : []),
        ];
        const collisionAvoided =
            targetCollision.reason !== undefined ||
            forearmCollision === "head_collision_avoided" ||
            forearmCollision === "chest_no_go_zone";
        const jointLimited =
            targetConstraint.limited ||
            upperLocalQuaternion.limited ||
            lowerLocalQuaternion.limited;
        const weightScale = this.constraintResolver.constraintWeightScale(
            jointLimited,
            elbowPole.stabilized,
            collisionAvoided,
        );
        return {
            constraint: {
                reasons: [...new Set(reasons)],
                jointLimited,
                poleStabilized: elbowPole.stabilized,
                collisionAvoided,
                weightScale,
                targetPushDistance: targetCollision.pushDistance,
            },
            weightScale,
        };
    }

    private poleDirection(
        elbowPole: Vector3,
        target: Vector3,
    ): {
        direction: Vector3;
        stabilized: boolean;
    } {
        const targetDirection = target.clone().normalize();
        const pole = elbowPole
            .clone()
            .sub(targetDirection.clone().multiplyScalar(elbowPole.dot(targetDirection)));
        if (targetDirectionIsUsable(pole)) {
            return this.stabilizePoleDirection(pole.normalize(), targetDirection);
        }
        const fallbackPole = this.bindPoleDirection
            .clone()
            .sub(
                targetDirection.clone().multiplyScalar(this.bindPoleDirection.dot(targetDirection)),
            );
        const direction = targetDirectionIsUsable(fallbackPole)
            ? fallbackPole.normalize()
            : new Vector3(0, 1, 0);
        return { direction, stabilized: true };
    }

    private stabilizePoleDirection(
        candidate: Vector3,
        targetDirection: Vector3,
    ): {
        direction: Vector3;
        stabilized: boolean;
    } {
        const fallback = this.lastPoleDirection ?? this.bindPoleDirection;
        const projectedFallback = fallback
            .clone()
            .sub(targetDirection.clone().multiplyScalar(fallback.dot(targetDirection)));
        if (!targetDirectionIsUsable(projectedFallback)) {
            return { direction: candidate, stabilized: false };
        }
        if (candidate.dot(projectedFallback.normalize()) >= this.options.poleFlipDotThreshold) {
            return { direction: candidate, stabilized: false };
        }
        return { direction: projectedFallback.normalize(), stabilized: true };
    }

    private directionInParentSpace(node: Object3D, direction: Vector3): Vector3 {
        return directionInWorldQuaternionSpace(
            node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion(),
            direction,
        );
    }

    private parentWorldQuaternion(): Quaternion {
        return this.upperArmNode.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    }

    private worldPosition(node: Object3D): Vector3 {
        return node.getWorldPosition(new Vector3());
    }
}

function getNode(vrm: VRM, name: VRMHumanBoneName): Object3D | undefined {
    return vrm.humanoid.getNormalizedBoneNode(name) ?? undefined;
}

function firstNode(vrm: VRM, names: VRMHumanBoneName[]): Object3D | undefined {
    for (const name of names) {
        const node = getNode(vrm, name);
        if (node) {
            return node;
        }
    }
    return undefined;
}
