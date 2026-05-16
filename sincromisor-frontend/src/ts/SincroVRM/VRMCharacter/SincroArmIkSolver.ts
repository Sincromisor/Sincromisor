import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";

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
    weight: number;
};

type SincroArmIkOptions = {
    maxUpperArmDeltaRad: number;
    maxLowerArmDeltaRad: number;
    minReachRatio: number;
    maxReachRatio: number;
};

const DEFAULT_OPTIONS: SincroArmIkOptions = {
    maxUpperArmDeltaRad: MathUtils.degToRad(116),
    maxLowerArmDeltaRad: MathUtils.degToRad(154),
    minReachRatio: 0.2,
    maxReachRatio: 0.985,
};

const MIN_DIRECTION_LENGTH = 1e-5;

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
    private readonly options: SincroArmIkOptions;

    static fromVrm(vrm: VRM, side: SincroArmSide): SincroArmIkSolver | null {
        vrm.scene.updateMatrixWorld(true);
        const upperArmNode = getNode(vrm, `${side}UpperArm` as VRMHumanBoneName);
        const lowerArmNode = getNode(vrm, `${side}LowerArm` as VRMHumanBoneName);
        const handNode = getNode(vrm, `${side}Hand` as VRMHumanBoneName);
        const oppositeUpperArmNode = getNode(
            vrm,
            `${side === "left" ? "right" : "left"}UpperArm` as VRMHumanBoneName,
        );
        if (!upperArmNode || !lowerArmNode || !handNode || !oppositeUpperArmNode) {
            return null;
        }
        return new SincroArmIkSolver(
            side,
            upperArmNode,
            lowerArmNode,
            handNode,
            oppositeUpperArmNode,
            DEFAULT_OPTIONS,
        );
    }

    private constructor(
        side: SincroArmSide,
        upperArmNode: Object3D,
        lowerArmNode: Object3D,
        handNode: Object3D,
        oppositeUpperArmNode: Object3D,
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
        this.bindLowerDirectionInUpper = this.directionInWorldQuaternionSpace(
            upperArmNode.getWorldQuaternion(new Quaternion()),
            hand.clone().sub(elbow),
        );
        this.bindPoleDirection = this.bindPoleFromArm(shoulder, elbow, hand);
    }

    solve(target: SincroArmIkTarget): SincroArmIkSolveResult | null {
        if (!targetDirectionIsUsable(target.wrist)) {
            return null;
        }

        this.upperArmNode.parent?.updateMatrixWorld(true);
        this.upperArmNode.updateMatrixWorld(true);
        const targetVector = target.wrist.clone();
        const targetClamp = this.clampTarget(targetVector);
        const elbowPole = this.poleDirection(target.elbowPole, targetClamp.target);
        const elbow = this.elbowPosition(targetClamp.target, elbowPole);
        const upperDirection = elbow.clone().normalize();
        const lowerDirection = targetClamp.target.clone().sub(elbow).normalize();

        if (!targetDirectionIsUsable(upperDirection) || !targetDirectionIsUsable(lowerDirection)) {
            return null;
        }

        const parentWorldQuaternion = this.parentWorldQuaternion();
        const upperLocalQuaternion = this.localQuaternionFromParentDirection(
            this.bindUpperDirectionInParent,
            this.directionInWorldQuaternionSpace(parentWorldQuaternion, upperDirection),
            this.neutralUpperArmQuaternion,
            this.options.maxUpperArmDeltaRad,
        );
        const upperSolvedWorldQuaternion = parentWorldQuaternion
            .clone()
            .multiply(upperLocalQuaternion);
        const lowerLocalQuaternion = this.localQuaternionFromParentDirection(
            this.bindLowerDirectionInUpper,
            this.directionInWorldQuaternionSpace(upperSolvedWorldQuaternion, lowerDirection),
            this.neutralLowerArmQuaternion,
            this.options.maxLowerArmDeltaRad,
        );

        return {
            upperArmQuaternion: serializeQuaternion(upperLocalQuaternion),
            lowerArmQuaternion: serializeQuaternion(lowerLocalQuaternion),
            neutralUpperArmQuaternion: serializeQuaternion(this.neutralUpperArmQuaternion),
            neutralLowerArmQuaternion: serializeQuaternion(this.neutralLowerArmQuaternion),
            targetClamped: targetClamp.clamped,
            weight: MathUtils.clamp(target.weight, 0, 1),
        };
    }

    private clampTarget(target: Vector3): { target: Vector3; clamped: boolean } {
        const maxReach = (this.upperArmLength + this.lowerArmLength) * this.options.maxReachRatio;
        const minReach = Math.max(
            Math.abs(this.upperArmLength - this.lowerArmLength),
            (this.upperArmLength + this.lowerArmLength) * this.options.minReachRatio,
        );
        const reach = target.length();
        const clampedReach = MathUtils.clamp(reach, minReach, maxReach);
        if (reach <= MIN_DIRECTION_LENGTH) {
            return {
                target: this.bindUpperDirectionInParent.clone().multiplyScalar(minReach),
                clamped: true,
            };
        }
        return {
            target: target.clone().multiplyScalar(clampedReach / reach),
            clamped: Math.abs(clampedReach - reach) > 1e-4,
        };
    }

    private elbowPosition(target: Vector3, poleDirection: Vector3): Vector3 {
        const reach = Math.max(target.length(), MIN_DIRECTION_LENGTH);
        const targetDirection = target.clone().multiplyScalar(1 / reach);
        const shoulderToElbow =
            (this.upperArmLength ** 2 - this.lowerArmLength ** 2 + reach ** 2) / (2 * reach);
        const elbowHeight = Math.sqrt(Math.max(this.upperArmLength ** 2 - shoulderToElbow ** 2, 0));
        return targetDirection
            .multiplyScalar(shoulderToElbow)
            .add(poleDirection.clone().multiplyScalar(elbowHeight));
    }

    private poleDirection(elbowPole: Vector3, target: Vector3): Vector3 {
        const targetDirection = target.clone().normalize();
        const pole = elbowPole
            .clone()
            .sub(targetDirection.clone().multiplyScalar(elbowPole.dot(targetDirection)));
        if (targetDirectionIsUsable(pole)) {
            return pole.normalize();
        }
        const fallbackPole = this.bindPoleDirection
            .clone()
            .sub(
                targetDirection.clone().multiplyScalar(this.bindPoleDirection.dot(targetDirection)),
            );
        return targetDirectionIsUsable(fallbackPole)
            ? fallbackPole.normalize()
            : new Vector3(0, 1, 0);
    }

    private localQuaternionFromParentDirection(
        bindDirection: Vector3,
        desiredDirection: Vector3,
        neutralQuaternion: Quaternion,
        maxDeltaRad: number,
    ): Quaternion {
        const deltaQuaternion = new Quaternion().setFromUnitVectors(
            bindDirection.clone().normalize(),
            desiredDirection.clone().normalize(),
        );
        const solvedQuaternion = neutralQuaternion.clone().premultiply(deltaQuaternion);
        const deltaRad = neutralQuaternion.angleTo(solvedQuaternion);
        if (deltaRad <= maxDeltaRad) {
            return solvedQuaternion.normalize();
        }
        return neutralQuaternion
            .clone()
            .slerp(solvedQuaternion, maxDeltaRad / Math.max(deltaRad, MIN_DIRECTION_LENGTH))
            .normalize();
    }

    private bindPoleFromArm(shoulder: Vector3, elbow: Vector3, hand: Vector3): Vector3 {
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
        return this.side === "left" ? new Vector3(-1, 0, 0) : new Vector3(1, 0, 0);
    }

    private directionInParentSpace(node: Object3D, direction: Vector3): Vector3 {
        return this.directionInWorldQuaternionSpace(
            node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion(),
            direction,
        );
    }

    private directionInWorldQuaternionSpace(
        worldQuaternion: Quaternion,
        direction: Vector3,
    ): Vector3 {
        return direction.clone().applyQuaternion(worldQuaternion.clone().invert()).normalize();
    }

    private parentWorldQuaternion(): Quaternion {
        return this.upperArmNode.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
    }

    private worldPosition(node: Object3D): Vector3 {
        return node.getWorldPosition(new Vector3());
    }
}

function getNode(vrm: VRM, name: VRMHumanBoneName): Object3D | null {
    return vrm.humanoid.getNormalizedBoneNode(name);
}

function targetDirectionIsUsable(direction: Vector3): boolean {
    return (
        Number.isFinite(direction.x) &&
        Number.isFinite(direction.y) &&
        Number.isFinite(direction.z) &&
        direction.lengthSq() > MIN_DIRECTION_LENGTH ** 2
    );
}

function serializeQuaternion(quaternion: Quaternion): SincroArmIkQuaternion {
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}
