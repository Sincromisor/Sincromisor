import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroPoseArmTargetSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { SincroArmIkSolveResult, SincroArmIkSolver } from "../ik/sincroArmIkSolver";
import { positiveOnly } from "./sincroPoseRetargetFrame";
import {
    armIkGateReason,
    armWorldIkGateReason,
    mapWorldTargetDeltaToVrm,
} from "./sincroPoseRetargetTargets";
import type { SincroPoseRetargetConfig } from "./sincroPoseRetargetTypes";

export type ArmSide = "left" | "right";

export type ArmIkSolvers = Record<ArmSide, SincroArmIkSolver>;

type ArmIkTarget = {
    lift: number;
    open: number;
    flex: number;
    pole: number;
    weight: number;
};

export type ArmIkSolveResult = {
    target?: ArmIkTarget;
    fallbackReason?: string;
};

export type WorldArmIkSolveResult = {
    result?: SincroArmIkSolveResult;
    fallbackReason?: string;
};

type SolveArmIkOptions = {
    targets: SincroPoseArmTargetSnapshot;
    side: ArmSide;
    config: SincroPoseRetargetConfig;
    armIkSolvers?: ArmIkSolvers;
};

/**
 * Pose snapshot の world wrist / elbow target から旧 production IK target を解く。
 *
 * @deprecated task-260705214026-canonical-temporal-arm-solver-production で production primary は
 * Temporal bridge へ移行した。P0 replay の A/B comparison と pose-snapshot fallback 削除 task で
 * 切り戻し不要と確認できたら、`retargetPoseArm()` の fallback 経路と合わせて削除する。
 */
export function solveWorldArmIk(options: SolveArmIkOptions): WorldArmIkSolveResult {
    const { targets, side, config, armIkSolvers } = options;
    const solver = armIkSolvers?.[side];
    if (!solver) {
        return { fallbackReason: "ik_solver_missing" };
    }
    const gateReason = armWorldIkGateReason(targets);
    if (gateReason) {
        return { fallbackReason: gateReason };
    }
    const wrist = mapWorldTargetDeltaToVrm(
        targets.shoulder,
        targets.wrist,
        solver.shoulderWidth * config.armIkTargetScale,
    );
    const elbowPole = mapWorldTargetDeltaToVrm(
        targets.shoulder,
        targets.elbow,
        solver.shoulderWidth * config.armIkTargetScale,
    );
    const weight = MathUtils.clamp(
        Math.min(
            targets.shoulder.world.worldIkWeight,
            targets.elbow.world.worldIkWeight,
            targets.wrist.world.worldIkWeight,
        ),
        0,
        1,
    );
    return {
        result: solver.solve({ wrist, elbowPole, weight }) ?? undefined,
        fallbackReason: undefined,
    };
}

export function solveScreenSpaceArmIk(options: SolveArmIkOptions): ArmIkSolveResult {
    const { targets, side, config, armIkSolvers } = options;
    const solver = armIkSolvers?.[side];
    if (!solver) {
        return {
            fallbackReason: "ik_solver_missing",
        };
    }
    const gateReason = armIkGateReason(targets);
    if (gateReason) {
        return { fallbackReason: gateReason };
    }
    const targetWeight = MathUtils.clamp(
        Math.min(targets.shoulder.ikWeight, targets.elbow.ikWeight, targets.wrist.ikWeight),
        0,
        1,
    );

    const sideSign = side === "left" ? -1 : 1;
    const modelScale = solver.shoulderWidth * config.armIkTargetScale;
    const wristX = (targets.wrist.localX - targets.shoulder.localX) * modelScale;
    const wristY = (targets.wrist.localY - targets.shoulder.localY) * modelScale;
    const elbowX = (targets.elbow.localX - targets.shoulder.localX) * modelScale;
    const elbowY = (targets.elbow.localY - targets.shoulder.localY) * modelScale;
    const maxReach = Math.max(solver.upperArmLength + solver.lowerArmLength, 0.01);
    const minReach = Math.max(
        Math.abs(solver.upperArmLength - solver.lowerArmLength),
        maxReach * 0.18,
    );
    const reach = MathUtils.clamp(Math.hypot(wristX, wristY), minReach, maxReach * 0.98);
    const normalizedReach = Math.max(reach, 1e-4);

    // Tracker target は肩幅基準の screen-space 2D 値なので、奥行きは解かずに
    // 手首方向を主軸、肘方向を pole の近似として使う。
    const openFromWrist = MathUtils.clamp((wristX * sideSign) / normalizedReach, -1, 1);
    const liftFromWrist = MathUtils.clamp(wristY / normalizedReach, -1, 1);
    const elbowMagnitude = Math.max(Math.hypot(elbowX, elbowY), 1e-4);
    const openFromElbow = MathUtils.clamp((elbowX * sideSign) / elbowMagnitude, -1, 1);
    const liftFromElbow = MathUtils.clamp(elbowY / elbowMagnitude, -1, 1);
    const elbowCos = MathUtils.clamp(
        (solver.upperArmLength ** 2 + solver.lowerArmLength ** 2 - reach ** 2) /
            (2 * solver.upperArmLength * solver.lowerArmLength),
        -1,
        1,
    );
    const elbowAngle = Math.acos(elbowCos);
    const flexByReach = MathUtils.clamp(1 - elbowAngle / Math.PI, 0, 1);
    const flexByPole = positiveOnly(liftFromElbow - liftFromWrist * 0.35) * 0.35;

    return {
        target: {
            lift: MathUtils.clamp(liftFromWrist * 0.72 + liftFromElbow * 0.28, -0.85, 0.95),
            open: MathUtils.clamp(openFromWrist * 0.7 + openFromElbow * 0.3, -0.75, 0.95),
            flex: MathUtils.clamp(flexByReach * 1.25 + flexByPole, 0, 1),
            pole: MathUtils.clamp(openFromElbow - openFromWrist * 0.35, -1, 1),
            weight: targetWeight,
        },
        fallbackReason: undefined,
    };
}
