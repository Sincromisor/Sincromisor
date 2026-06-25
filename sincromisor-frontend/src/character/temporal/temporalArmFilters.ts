import type { CanonicalArmState, CanonicalTuple3 } from "../canonical/canonicalUpperBodyState";
import { OneEuroFilter1D, type OneEuroFilterConfig } from "./oneEuroFilter";
import type { TemporalArmState, TemporalTuple3 } from "./temporalUpperBodyState";

export type ArmFilters = {
    reach: OneEuroFilter1D;
    elevationRad: OneEuroFilter1D;
    openness: OneEuroFilter1D;
    forwardness: OneEuroFilter1D;
    elbowFlexionRad: OneEuroFilter1D;
    wristX: OneEuroFilter1D;
    wristY: OneEuroFilter1D;
    wristZ: OneEuroFilter1D;
};

export type FilteredArmValues = Pick<
    TemporalArmState,
    "reach" | "elevationRad" | "openness" | "forwardness" | "elbowFlexionRad" | "bodyLocalWrist"
>;

export function createArmFilters(config: OneEuroFilterConfig): ArmFilters {
    return {
        reach: new OneEuroFilter1D(config),
        elevationRad: new OneEuroFilter1D(config),
        openness: new OneEuroFilter1D(config),
        forwardness: new OneEuroFilter1D(config),
        elbowFlexionRad: new OneEuroFilter1D(config),
        wristX: new OneEuroFilter1D(config),
        wristY: new OneEuroFilter1D(config),
        wristZ: new OneEuroFilter1D(config),
    };
}

export function resetArmFilters(filters: ArmFilters): void {
    filters.reach.reset();
    filters.elevationRad.reset();
    filters.openness.reset();
    filters.forwardness.reset();
    filters.elbowFlexionRad.reset();
    filters.wristX.reset();
    filters.wristY.reset();
    filters.wristZ.reset();
}

export function filterObservedArm(
    arm: CanonicalArmState,
    filters: ArmFilters,
    dtMs: number,
): FilteredArmValues {
    return {
        reach: filters.reach.update(arm.reach, dtMs),
        elevationRad: filters.elevationRad.update(arm.elevationRad, dtMs),
        openness: filters.openness.update(arm.openness, dtMs),
        forwardness: filters.forwardness.update(arm.forwardness, dtMs),
        elbowFlexionRad: filters.elbowFlexionRad.update(arm.elbowFlexionRad, dtMs),
        bodyLocalWrist: filterWrist(arm.bodyLocalWrist, filters, dtMs),
    };
}

export function holdPreviousArm(arm: TemporalArmState): FilteredArmValues {
    return {
        reach: arm.reach,
        elevationRad: arm.elevationRad,
        openness: arm.openness,
        forwardness: arm.forwardness,
        elbowFlexionRad: arm.elbowFlexionRad,
        bodyLocalWrist: arm.bodyLocalWrist,
    };
}

export function calculateVelocity(
    arm: FilteredArmValues,
    previousArm: TemporalArmState | undefined,
    dtMs: number,
): TemporalArmState["velocity"] {
    if (previousArm === undefined || dtMs <= 0) {
        return createZeroVelocity(previousArm);
    }

    const dtSec = dtMs / 1000;
    return {
        wrist: calculateWristVelocity(arm.bodyLocalWrist, previousArm.bodyLocalWrist, dtSec),
        reachPerSec: (arm.reach - previousArm.reach) / dtSec,
        elevationRadPerSec: (arm.elevationRad - previousArm.elevationRad) / dtSec,
        opennessPerSec: (arm.openness - previousArm.openness) / dtSec,
        forwardnessPerSec: (arm.forwardness - previousArm.forwardness) / dtSec,
        elbowFlexionRadPerSec: (arm.elbowFlexionRad - previousArm.elbowFlexionRad) / dtSec,
    };
}

export function createZeroVelocity(
    previousArm: TemporalArmState | undefined,
): TemporalArmState["velocity"] {
    return {
        wrist: previousArm?.bodyLocalWrist === undefined ? undefined : [0, 0, 0],
        reachPerSec: 0,
        elevationRadPerSec: 0,
        opennessPerSec: 0,
        forwardnessPerSec: 0,
        elbowFlexionRadPerSec: 0,
    };
}

export function tupleOrUndefined(tuple: CanonicalTuple3 | undefined): TemporalTuple3 | undefined {
    if (tuple === undefined) {
        return undefined;
    }
    return [tuple[0], tuple[1], tuple[2]];
}

function filterWrist(
    wrist: CanonicalTuple3 | undefined,
    filters: ArmFilters,
    dtMs: number,
): TemporalTuple3 | undefined {
    if (wrist === undefined) {
        return undefined;
    }
    return [
        filters.wristX.update(wrist[0], dtMs),
        filters.wristY.update(wrist[1], dtMs),
        filters.wristZ.update(wrist[2], dtMs),
    ];
}

function calculateWristVelocity(
    wrist: TemporalTuple3 | undefined,
    previousWrist: TemporalTuple3 | undefined,
    dtSec: number,
): TemporalTuple3 | undefined {
    if (wrist === undefined || previousWrist === undefined) {
        return undefined;
    }
    return [
        (wrist[0] - previousWrist[0]) / dtSec,
        (wrist[1] - previousWrist[1]) / dtSec,
        (wrist[2] - previousWrist[2]) / dtSec,
    ];
}
