import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type { SincroArmIkTarget, SincroArmSide } from "../ik/sincroArmIkTypes";
import {
    createTemporalArmIkInput,
    type TemporalArmIkBridgeResult,
    type TemporalArmIkSolverMeasurements,
} from "../motionSolver/temporalArmSolverBridge";
import type { TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";
import type { SincroPoseArmSolverSource } from "./sincroPoseRetargetTypes";

/**
 * Pose retargeter から temporal arm solver bridge へ渡す腕単位の入力境界。
 *
 * `snapshot` は Pose snapshot fallback の戻り先を明示するための境界であり、temporal primary
 * target の算出には Pose wrist / Hand wrist を使わない。`temporal`、`profile`、`solver` は
 * 欠損を許容し、欠損時は source diagnostic に理由を残して fallback する。solver 測定値以外の
 * VRM / Three.js runtime object や MediaPipe raw result はこの型に含めない。
 */
export type SincroPoseTemporalArmInput = {
    snapshot: SincroPoseMotionSnapshot;
    temporal?: TemporalUpperBodyState;
    profile?: MinimalAvatarMotionProfile;
    solver?: TemporalArmIkSolverMeasurements;
    side: SincroArmSide;
};

/**
 * temporal arm solver bridge の解決結果と、同じ frame の debug / replay 用 source snapshot。
 *
 * `target` は temporal bridge が有効な frame だけに入り、欠損または invalid/lost では例外にせず
 * Pose snapshot fallback として `source` に理由を保存する。`bridge` は clamp や lost 判定の詳細を
 * debug surface へ出す optional diagnostic で、保存境界は plain object に限定する。
 */
export type SincroPoseTemporalArmInputResult = {
    target?: SincroArmIkTarget;
    bridge?: TemporalArmIkBridgeResult;
    source: SincroPoseArmSolverSource;
};

/**
 * production retarget が腕 IK の primary target として読む Temporal bridge 入力を解決する。
 *
 * `snapshot` は pose-snapshot fallback の境界を明示するために受け取るが、temporal primary の target
 * 算出では Pose wrist / Hand wrist を再読解しない。`temporal`、`profile`、`solver` の欠損や
 * bridge invalid/lost は throw せず、同一 frame の Phase 6 debug snapshot で観測できる
 * `pose-snapshot-fallback` source に落とす。
 */
export function createSincroPoseTemporalArmInput(
    input: SincroPoseTemporalArmInput,
): SincroPoseTemporalArmInputResult {
    const missingReasonCodes = missingRuntimeReasonCodes(input);
    if (missingReasonCodes.length > 0) {
        return createFallbackResult(missingReasonCodes);
    }
    if (input.temporal === undefined || input.profile === undefined || input.solver === undefined) {
        return createFallbackResult(["invalid_temporal_arm"]);
    }

    const bridge = createTemporalArmIkInput({
        temporal: input.temporal,
        side: input.side,
        profile: input.profile,
        solver: input.solver,
    });
    if (bridge.target === undefined) {
        const reasonCodes =
            bridge.reasonCodes.length > 0 ? bridge.reasonCodes : ["invalid_temporal_arm"];
        return {
            bridge,
            source: createFallbackSource(reasonCodes),
        };
    }

    return {
        target: bridge.target,
        bridge,
        source: {
            primarySource: "temporal",
            bridgeReasonCodes: [...bridge.reasonCodes],
            targetReachRatio: bridge.target.targetReachRatio,
            temporalState: bridge.target.temporalState,
        },
    };
}

function missingRuntimeReasonCodes(input: SincroPoseTemporalArmInput): string[] {
    const reasonCodes: string[] = [];
    if (input.temporal === undefined) {
        reasonCodes.push("temporal_input_missing");
    }
    if (input.profile === undefined) {
        reasonCodes.push("avatar_profile_missing");
    }
    if (input.solver === undefined) {
        reasonCodes.push("ik_solver_missing");
    }
    return reasonCodes;
}

function createFallbackResult(reasonCodes: string[]): SincroPoseTemporalArmInputResult {
    return {
        source: createFallbackSource(reasonCodes),
    };
}

function createFallbackSource(reasonCodes: string[]): SincroPoseArmSolverSource {
    return {
        primarySource: "pose-snapshot-fallback",
        fallbackReason: reasonCodes[0] ?? "invalid_temporal_arm",
        bridgeReasonCodes: [...reasonCodes],
    };
}
