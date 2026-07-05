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

export type SincroPoseTemporalArmInput = {
    snapshot: SincroPoseMotionSnapshot;
    temporal?: TemporalUpperBodyState;
    profile?: MinimalAvatarMotionProfile;
    solver?: TemporalArmIkSolverMeasurements;
    side: SincroArmSide;
};

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
