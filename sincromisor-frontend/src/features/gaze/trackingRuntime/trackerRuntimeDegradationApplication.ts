/**
 * ordered degradation policy の decision を runtime の effective cadence / ROI pause state へ反映する変換層。
 * policy stage の意味は stats と motion-debug に露出するため、stage 名や停止対象を変更する場合は tracking design の ordered stage を確認する。
 */
import type { SincroTrackerRoiPauseState } from "./sincroTrackerWorkerTypes";
import type {
    TrackerRuntimeDegradationPolicyCadence,
    TrackerRuntimeDegradationPolicyDecision,
    TrackerRuntimeDegradationStage,
} from "./trackerRuntimeDegradationPolicy";
import type { TrackerPerformanceReasonCode } from "./trackerRuntimePerformanceBudget";
import type { TrackerRuntimeMutableState, TrackerVideoFrameTiming } from "./trackerRuntimeTypes";

export type TrackerRuntimeDegradationAction =
    | "resume-pose"
    | "degrade-to-face-only"
    | "enter-comfortable-idle";

export type TrackerRuntimeDegradationApplicationResult = {
    state: TrackerRuntimeMutableState;
    appliedCadence: TrackerRuntimeDegradationPolicyCadence;
    roiPauseState?: SincroTrackerRoiPauseState;
    actions: TrackerRuntimeDegradationAction[];
};

export function applyTrackerRuntimeDegradationDecision(input: {
    decision: TrackerRuntimeDegradationPolicyDecision;
    state: TrackerRuntimeMutableState;
    timing: TrackerVideoFrameTiming;
}): TrackerRuntimeDegradationApplicationResult {
    const appliedCadence = capPolicyCadence(input.decision.effectiveCadence, input.state);
    const nextState = applyCadence(input.state, appliedCadence);
    const actions: TrackerRuntimeDegradationAction[] = [];

    if (
        nextState.poseDegradedToFaceOnly &&
        !trackerRuntimePolicyStageStopsPose(input.decision.state.stage) &&
        trackerRuntimePolicyStageStopsPose(input.decision.state.previousStage)
    ) {
        nextState.poseDegradedToFaceOnly = false;
        nextState.comfortableIdleActive = false;
        actions.push("resume-pose");
    }

    // Ordered degradation stage は policy が決め、runtime は state と cadence へ反映するだけにする。
    if (nextState.poseDegradedToFaceOnly && input.decision.trackerDegradationState === "full") {
        nextState.degradationState = "face-only";
    } else {
        nextState.degradationState = input.decision.trackerDegradationState;
        nextState.degradationReason = resolvePrimaryPolicyReason(input.decision);
        nextState.degradationSinceMediaTimeMs = input.decision.state.sinceMediaTimeMs;
    }

    if (input.decision.shouldDegradeToFaceOnly && !nextState.poseDegradedToFaceOnly) {
        actions.push("degrade-to-face-only");
    }
    if (input.decision.shouldEnterComfortableIdle && !nextState.comfortableIdleActive) {
        actions.push("enter-comfortable-idle");
    }
    return {
        state: nextState,
        appliedCadence,
        roiPauseState: input.decision.roiPauseState,
        actions,
    };
}

export function trackerRuntimePolicyStageStopsPose(
    stage: TrackerRuntimeDegradationStage | undefined,
): boolean {
    return stage === "face-only" || stage === "comfortable-idle";
}

function applyCadence(
    state: TrackerRuntimeMutableState,
    cadence: TrackerRuntimeDegradationPolicyCadence,
): TrackerRuntimeMutableState {
    return {
        ...state,
        targetInferenceFps: Math.max(1, cadence.faceFps),
        targetPoseInferenceFps: Math.max(1, cadence.poseFps),
        targetHandInferenceFps: Math.max(1, cadence.handFps),
        targetGestureInferenceFps: Math.max(1, cadence.gestureFps),
        targetFaceRoiInferenceFps: Math.max(1, cadence.faceRoiFps),
    };
}

function capPolicyCadence(
    cadence: TrackerRuntimeDegradationPolicyCadence,
    state: TrackerRuntimeMutableState,
): TrackerRuntimeDegradationPolicyCadence {
    return {
        faceFps: Math.min(state.baseTargetInferenceFps, cadence.faceFps),
        poseFps:
            cadence.poseFps === 0 ? 0 : Math.min(state.baseTargetPoseInferenceFps, cadence.poseFps),
        handFps:
            cadence.handFps === 0 ? 0 : Math.min(state.baseTargetHandInferenceFps, cadence.handFps),
        gestureFps:
            cadence.gestureFps === 0
                ? 0
                : Math.min(state.baseTargetGestureInferenceFps, cadence.gestureFps),
        faceRoiFps:
            cadence.faceRoiFps === 0
                ? 0
                : Math.min(state.baseTargetFaceRoiInferenceFps, cadence.faceRoiFps),
    };
}

function resolvePrimaryPolicyReason(
    decision: TrackerRuntimeDegradationPolicyDecision,
): TrackerPerformanceReasonCode | undefined {
    return decision.reasonCodes[0];
}
