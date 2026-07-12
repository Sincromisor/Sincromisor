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
import { resolveArmIkPoleDirection, type SincroArmIkElbowPole } from "./sincroArmIkPole";
import {
    createDefaultSincroArmIkRefinementConfig,
    createSincroArmIkRefinementCandidates,
    createSincroArmIkRefinementResult,
    REJECTED_SINCRO_ARM_IK_REFINEMENT_CANDIDATE_COST,
    type SincroArmIkRefinementCandidate,
    type SincroArmIkRefinementCandidateSummary,
    type SincroArmIkRefinementConfig,
    type SincroArmIkRefinementResult,
} from "./sincroArmIkRefinement";
import {
    captureSincroArmIkSkeleton,
    type SincroArmIkSkeleton,
    type SincroArmIkVrmSource,
} from "./sincroArmIkSkeleton";
import type {
    SincroArmIkOptions,
    SincroArmIkSolveResult,
    SincroArmIkTarget,
    SincroArmSide,
} from "./sincroArmIkTypes";

export {
    createDefaultSincroArmIkRefinementConfig,
    type SincroArmIkRefinementCandidate,
    type SincroArmIkRefinementConfig,
    type SincroArmIkRefinementResult,
} from "./sincroArmIkRefinement";
export type {
    SincroArmIkOptions,
    SincroArmIkQuaternion,
    SincroArmIkSolveResult,
    SincroArmIkTarget,
    SincroArmSide,
} from "./sincroArmIkTypes";

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
    wristRollInfluence?: number;
};

type SincroArmIkEvaluatedTarget = {
    result: SincroArmIkSolveResult;
    prepared: SincroArmIkPreparedTarget;
    solved: SincroArmIkSolvedQuaternions;
};

type SincroArmIkCandidateEvaluation = {
    evaluation?: SincroArmIkEvaluatedTarget;
} & SincroArmIkRefinementCandidateSummary;

type SincroArmIkSolverConstructorOptions = SincroArmIkSkeleton & {
    options: SincroArmIkOptions;
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

    /**
     * 異なるtarget sourceへ切り替える前に、前sourceのelbow-pole履歴を破棄する。
     *
     * Pose world targetとtemporal body-local bridgeはpoleの生成基準が異なるため、sourceを跨いで
     * previous poleを比較すると、安定した新sourceを永続的なflipとしてrejectし得る。bone計測値や
     * bind poseは不変なので、このresetはpole履歴だけを対象にする。
     */
    resetPoleHistory(): void {
        this.lastPoleDirection = undefined;
    }

    static fromVrm(vrm: SincroArmIkVrmSource, side: SincroArmSide): SincroArmIkSolver | undefined {
        const skeleton = captureSincroArmIkSkeleton(vrm, side);
        if (!skeleton) {
            return undefined;
        }
        return new SincroArmIkSolver({
            ...skeleton,
            options: DEFAULT_OPTIONS,
        });
    }

    private constructor({
        side,
        upperArmNode,
        lowerArmNode,
        handNode,
        oppositeUpperArmNode,
        headNode,
        chestNode,
        options,
    }: SincroArmIkSolverConstructorOptions) {
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
        const evaluated = this.evaluateTarget(target);
        if (!evaluated) {
            return undefined;
        }

        this.commitPoleDirection(evaluated.prepared);
        return evaluated.result;
    }

    solveRefined(
        target: SincroArmIkTarget,
        config?: Partial<SincroArmIkRefinementConfig>,
    ): SincroArmIkSolveResult | undefined {
        const refinementConfig = {
            ...createDefaultSincroArmIkRefinementConfig(),
            ...config,
        };
        if (refinementConfig.enabled !== true) {
            return this.solve(target);
        }
        this.upperArmNode.parent?.updateMatrixWorld(true);
        this.upperArmNode.updateMatrixWorld(true);

        const candidates = createSincroArmIkRefinementCandidates(target.wrist, refinementConfig);
        const evaluations = candidates.map((candidate) =>
            this.evaluateRefinementCandidate(target, candidate, refinementConfig),
        );
        const selected = selectBestEvaluation(evaluations);
        const original = evaluations[0];
        if (!selected?.evaluation || !original?.evaluation) {
            return undefined;
        }

        this.commitPoleDirection(selected.evaluation.prepared);
        const refinement = createSincroArmIkRefinementResult(evaluations, selected, original);
        const result = attachRefinementResult(
            selected.evaluation.result,
            refinement,
            selected.candidate.index !== 0,
        );
        return result;
    }

    private prepareTarget(target: SincroArmIkTarget): SincroArmIkPreparedTarget | undefined {
        const targetVector = target.wrist.clone();
        const targetReachRatio =
            target.targetReachRatio ??
            targetVector.length() / (this.upperArmLength + this.lowerArmLength);
        const targetConstraint = this.constraintResolver.constrainShoulderTarget(targetVector);
        const targetCollision = this.constraintResolver.avoidNoGoZones(targetConstraint.target);
        const targetClamp = clampArmIkTarget({
            target: targetCollision.target,
            upperArmLength: this.upperArmLength,
            lowerArmLength: this.lowerArmLength,
            bindUpperDirection: this.bindUpperDirectionInParent,
            options: this.options,
        });
        const elbowPole = resolveArmIkPoleDirection({
            elbowPole: target.elbowPole,
            target: targetClamp.target,
            bindPoleDirection: this.bindPoleDirection,
            lastPoleDirection: this.lastPoleDirection,
            previousPoleDirection: this.lastPoleDirection,
            poleFlipDotThreshold: this.options.poleFlipDotThreshold,
            temporalState: target.temporalState,
            elbowFlexionRad: target.elbowFlexionRad,
            recoveringBlendProgress: target.recoveringBlendProgress,
            targetReachRatio,
        });
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

    private evaluateTarget(target: SincroArmIkTarget): SincroArmIkEvaluatedTarget | undefined {
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
            wristRollInfluence: target.wristRollInfluence,
        });

        return {
            prepared,
            solved,
            result: {
                upperArmQuaternion: serializeQuaternion(solved.upperLocalQuaternion.quaternion),
                lowerArmQuaternion: serializeQuaternion(solved.lowerLocalQuaternion.quaternion),
                neutralUpperArmQuaternion: serializeQuaternion(this.neutralUpperArmQuaternion),
                neutralLowerArmQuaternion: serializeQuaternion(this.neutralLowerArmQuaternion),
                targetClamped: prepared.targetClamp.clamped,
                appliedTargetLength: prepared.targetClamp.target.length(),
                reachClamped: prepared.targetClamp.clamped,
                constraint: constraintResult.constraint,
                weight: MathUtils.clamp(target.weight, 0, 1) * constraintResult.weightScale,
            },
        };
    }

    private evaluateRefinementCandidate(
        originalTarget: SincroArmIkTarget,
        candidate: SincroArmIkRefinementCandidate,
        config: SincroArmIkRefinementConfig,
    ): SincroArmIkCandidateEvaluation {
        const armLength = this.upperArmLength + this.lowerArmLength;
        const deltaRatio = candidate.wrist.distanceTo(originalTarget.wrist) / armLength;
        if (deltaRatio > config.maxTargetDeltaRatio) {
            return rejectedEvaluation(candidate, "target_delta_exceeded");
        }
        if (!targetDirectionIsUsable(candidate.wrist)) {
            return rejectedEvaluation(candidate, "unusable_direction");
        }

        const evaluation = this.evaluateTarget({
            ...originalTarget,
            wrist: candidate.wrist,
        });
        if (!evaluation) {
            return rejectedEvaluation(candidate, "unusable_direction");
        }
        return {
            candidate,
            evaluation,
            cost: refinementCost(evaluation, deltaRatio),
            rejected: false,
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
        wristRollInfluence,
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
        const weightScale =
            this.constraintResolver.constraintWeightScale(
                jointLimited,
                elbowPole.stabilized,
                collisionAvoided,
            ) * elbowPole.weightScale;
        const reasonCodes = [...new Set([...reasons, ...elbowPole.reasonCodes])];
        return {
            constraint: {
                reasons: [...new Set(reasons)],
                jointLimited,
                poleStabilized: elbowPole.stabilized,
                collisionAvoided,
                weightScale,
                targetPushDistance: targetCollision.pushDistance,
                poleState: elbowPole.state,
                reasonCodes,
                angularVelocityClamped: false,
                wristRollDamped: false,
                wristRollInfluence: isFiniteNumber(wristRollInfluence)
                    ? MathUtils.clamp(wristRollInfluence, 0, 1)
                    : undefined,
            },
            weightScale,
        };
    }

    private commitPoleDirection(prepared: SincroArmIkPreparedTarget): void {
        this.lastPoleDirection = prepared.elbowPole.direction.clone();
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

function isFiniteNumber(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function rejectedEvaluation(
    candidate: SincroArmIkRefinementCandidate,
    rejectReason: "target_delta_exceeded" | "unusable_direction",
): SincroArmIkCandidateEvaluation {
    return {
        candidate,
        cost: REJECTED_SINCRO_ARM_IK_REFINEMENT_CANDIDATE_COST,
        rejected: true,
        rejectReason,
    };
}

function refinementCost(evaluation: SincroArmIkEvaluatedTarget, deltaRatio: number): number {
    const reasonCodes = evaluation.result.constraint.reasonCodes ?? [];
    return (
        (evaluation.prepared.targetClamp.clamped ? 3 : 0) +
        (reasonCodes.includes("pole_flip_rejected") ? 4 : 0) +
        (reasonCodes.includes("pole_uncertain_downweighted") ? 1.5 : 0) +
        (evaluation.result.constraint.collisionAvoided === true ? 2 : 0) +
        (evaluation.solved.upperLocalQuaternion.limited ? 1 : 0) +
        (evaluation.solved.lowerLocalQuaternion.limited ? 1 : 0) +
        0.5 * deltaRatio
    );
}

function selectBestEvaluation(
    evaluations: SincroArmIkCandidateEvaluation[],
): SincroArmIkCandidateEvaluation | undefined {
    let best: SincroArmIkCandidateEvaluation | undefined;
    for (const evaluation of evaluations) {
        if (evaluation.rejected || !evaluation.evaluation) {
            continue;
        }
        if (!best || evaluation.cost < best.cost) {
            best = evaluation;
        }
    }
    return best;
}

function attachRefinementResult(
    result: SincroArmIkSolveResult,
    refinement: SincroArmIkRefinementResult,
    applied: boolean,
): SincroArmIkSolveResult {
    return {
        ...result,
        constraint: {
            ...result.constraint,
            reasonCodes: applied
                ? [...new Set([...(result.constraint.reasonCodes ?? []), "phase11_ik_refined"])]
                : result.constraint.reasonCodes,
        },
        refinement,
    };
}
