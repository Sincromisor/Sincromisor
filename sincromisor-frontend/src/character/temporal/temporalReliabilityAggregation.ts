import type {
    JointReliability,
    PartReliability,
    ReliabilityMap,
    ReliabilityPartState,
} from "../reliability/reliabilityMap";
import type { TemporalPartState } from "./temporalUpperBodyState";

export type ArmSide = "left" | "right";

export type ArmReliabilitySnapshot = {
    state: TemporalPartState;
    isPresent: boolean;
};

const STATE_PRIORITY: Record<ReliabilityPartState, number> = {
    tracked: 0,
    suspect: 1,
    recovering: 2,
    predicted: 3,
    lost: 4,
};

export function aggregateArmReliability(
    side: ArmSide,
    reliability: ReliabilityMap | undefined,
): ArmReliabilitySnapshot {
    if (reliability === undefined) {
        return { state: "tracked", isPresent: false };
    }

    const part = side === "left" ? reliability.parts.leftArm : reliability.parts.rightArm;
    const shoulder =
        side === "left" ? reliability.joints.leftShoulder : reliability.joints.rightShoulder;
    const elbow = side === "left" ? reliability.joints.leftElbow : reliability.joints.rightElbow;
    const wrist = side === "left" ? reliability.joints.leftWrist : reliability.joints.rightWrist;

    return {
        state: downcastReliabilityState(chooseWorstReliabilityState(part, shoulder, elbow, wrist)),
        isPresent: true,
    };
}

function chooseWorstReliabilityState(
    part: PartReliability,
    shoulder: JointReliability,
    elbow: JointReliability,
    wrist: JointReliability,
): ReliabilityPartState {
    let worst = part.state;
    for (const state of [shoulder.state, elbow.state, wrist.state]) {
        if (STATE_PRIORITY[state] > STATE_PRIORITY[worst]) {
            worst = state;
        }
    }
    return worst;
}

function downcastReliabilityState(state: ReliabilityPartState): TemporalPartState {
    if (state === "lost") {
        return "lost";
    }
    if (state === "tracked") {
        return "tracked";
    }
    return "suspect";
}
