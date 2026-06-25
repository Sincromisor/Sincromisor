import { describe, expect, it } from "vitest";

import type { MinimalAvatarMotionProfile } from "../../avatarProfile/minimalAvatarMotionProfile";
import {
    createDefaultTemporalUpperBodyState,
    type TemporalArmState,
    type TemporalUpperBodyState,
} from "../../temporal/temporalUpperBodyState";
import {
    createTemporalArmIkInput,
    type TemporalArmIkSolverMeasurements,
} from "../temporalArmSolverBridge";

const SOLVER: TemporalArmIkSolverMeasurements = {
    shoulderWidth: 0.8,
    upperArmLength: 0.4,
    lowerArmLength: 0.6,
};

const PROFILE: MinimalAvatarMotionProfile = {
    schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
    optionalBones: {
        upperChest: true,
        leftShoulder: true,
        rightShoulder: true,
        leftHand: true,
        rightHand: true,
        leftThumbProximal: true,
        rightThumbProximal: true,
        leftIndexProximal: true,
        rightIndexProximal: true,
    },
    measurements: {
        shoulderWidth: 1,
        leftUpperArmLength: 0.45,
        leftLowerArmLength: 0.55,
        rightUpperArmLength: 0.4,
        rightLowerArmLength: 0.6,
    },
    solverDefaults: {
        defaultReachScale: 1,
        depthCompression: 0.55,
        lateralScale: 1,
        verticalScale: 0.92,
        shoulderDamping: 0.65,
        wristRollInfluence: 0.25,
    },
    warnings: [],
};

function createTemporal(
    side: "left" | "right",
    overrides: Partial<TemporalArmState>,
): TemporalUpperBodyState {
    const temporal = createDefaultTemporalUpperBodyState(1000);
    temporal.arms[side] = {
        ...temporal.arms[side],
        state: "tracked",
        confidence: 0.8,
        source: "canonical",
        warnings: [],
        reach: 0.5,
        elevationRad: 0,
        openness: 0.4,
        forwardness: 0.3,
        elbowFlexionRad: 1,
        classification: "front",
        velocity: {
            reachPerSec: 0,
            elevationRadPerSec: 0,
            opennessPerSec: 0,
            forwardnessPerSec: 0,
            elbowFlexionRadPerSec: 0,
        },
        ...overrides,
    };
    return temporal;
}

function createProfile(
    overrides: Partial<MinimalAvatarMotionProfile["solverDefaults"]> = {},
): MinimalAvatarMotionProfile {
    return {
        ...PROFILE,
        measurements: { ...PROFILE.measurements },
        solverDefaults: { ...PROFILE.solverDefaults, ...overrides },
        warnings: [...PROFILE.warnings],
    };
}

function expectTupleClose(
    actual: readonly [number, number, number] | undefined,
    expected: readonly [number, number, number],
): void {
    expect(actual).toBeDefined();
    expect(actual?.[0]).toBeCloseTo(expected[0], 6);
    expect(actual?.[1]).toBeCloseTo(expected[1], 6);
    expect(actual?.[2]).toBeCloseTo(expected[2], 6);
}

describe("createTemporalArmIkInput", () => {
    it("uses body-local wrist and elbow as shoulder-local IK targets", () => {
        const temporal = createTemporal("right", {
            bodyLocalWrist: [0.9, 0.2, 0.3],
            bodyLocalElbow: [0.7, 0.1, 0.2],
        });

        const result = createTemporalArmIkInput({
            temporal,
            side: "right",
            profile: PROFILE,
            solver: SOLVER,
        });

        expect(result.reasonCodes).toEqual([]);
        expect(result.sourceState).toBe("tracked");
        expect(result.scale).toMatchObject({
            shoulderWidth: 1,
            upperArmLength: 0.4,
            lowerArmLength: 0.6,
            armLength: 1,
            maxReachRatio: 0.985,
        });
        expect(result.debug.usedBodyLocalWrist).toBe(true);
        expect(result.debug.usedBodyLocalElbow).toBe(true);
        expect(result.debug.shoulderLocal).toEqual([0.5, 0, 0]);
        expectTupleClose(result.debug.wristBeforeClamp, [0.4, 0.184, 0.165]);
        expect(result.debug.wristAfterClamp).toEqual(result.debug.wristBeforeClamp);
        expectTupleClose(result.debug.elbowPoleBeforeNormalize, [0.2, 0.092, 0.11]);
        expect(result.target?.wrist.x).toBeCloseTo(0.4, 6);
        expect(result.target?.wrist.y).toBeCloseTo(0.184, 6);
        expect(result.target?.wrist.z).toBeCloseTo(0.165, 6);
        expect(result.target?.elbowPole.x).toBeCloseTo(0.2, 6);
        expect(result.target?.weight).toBeCloseTo(0.8, 6);
        expect(result.target?.temporalState).toBe("tracked");
        expect(result.target?.wristRollInfluence).toBeCloseTo(0.25, 6);
    });

    it("reconstructs a deterministic scalar fallback when body-local wrist is missing", () => {
        const temporal = createTemporal("left", {
            bodyLocalWrist: undefined,
            bodyLocalElbow: undefined,
            reach: 0.5,
            elevationRad: Math.PI / 6,
            openness: 0.4,
            forwardness: 0.3,
            elbowFlexionRad: Math.PI / 2,
        });

        const result = createTemporalArmIkInput({
            temporal,
            side: "left",
            profile: PROFILE,
            solver: SOLVER,
        });

        expect(result.target).toBeDefined();
        expect(result.debug.usedBodyLocalWrist).toBe(false);
        expect(result.debug.usedBodyLocalElbow).toBe(false);
        expect(result.target?.wrist.x).toBeCloseTo(-0.2, 6);
        expect(result.target?.wrist.y).toBeCloseTo(0.23, 6);
        expect(result.target?.wrist.z).toBeCloseTo(0.0825, 6);
        expect(result.target?.elbowPole.x).toBeCloseTo(-0.18, 6);
        expect(result.target?.elbowPole.y).toBeCloseTo(0.45, 6);
    });

    it("returns no target and a lost reason for lost temporal arms", () => {
        const temporal = createTemporal("right", {
            state: "lost",
            confidence: 0.9,
            bodyLocalWrist: [0.9, 0.2, 0.3],
        });

        const result = createTemporalArmIkInput({
            temporal,
            side: "right",
            profile: PROFILE,
            solver: SOLVER,
        });

        expect(result.target).toBeUndefined();
        expect(result.reasonCodes).toEqual(["temporal_arm_lost"]);
        expect(result.debug.weightBeforeStateScale).toBe(0);
        expect(result.debug.weightAfterStateScale).toBe(0);
    });

    it("weights recovering arms by recovering blend progress", () => {
        const temporal = createTemporal("right", {
            state: "recovering",
            confidence: 0.8,
            recoveringBlend: {
                from: "predicted",
                progress: 0.25,
                durationMs: 260,
            },
        });

        const result = createTemporalArmIkInput({
            temporal,
            side: "right",
            profile: PROFILE,
            solver: SOLVER,
        });

        expect(result.debug.weightBeforeStateScale).toBeCloseTo(0.8, 6);
        expect(result.debug.weightAfterStateScale).toBeCloseTo(0.2, 6);
        expect(result.target?.weight).toBeCloseTo(0.2, 6);
        expect(result.target?.recoveringBlendProgress).toBeCloseTo(0.25, 6);
    });

    it("applies profile scale and depth compression before reach clamp", () => {
        const temporal = createTemporal("right", {
            bodyLocalWrist: undefined,
            reach: 1,
            elevationRad: Math.PI / 2,
            openness: 1,
            forwardness: 1,
        });
        const profile = createProfile({
            defaultReachScale: 2,
            lateralScale: 3,
            verticalScale: 4,
            depthCompression: 0.5,
        });

        const result = createTemporalArmIkInput({
            temporal,
            side: "right",
            profile,
            solver: SOLVER,
        });

        expect(result.scale).toMatchObject({
            defaultReachScale: 2,
            lateralScale: 3,
            verticalScale: 4,
            depthCompression: 0.5,
        });
        expectTupleClose(result.debug.wristBeforeClamp, [6, 8, 1]);
        expect(result.target?.wrist.length()).toBeCloseTo(0.985, 6);
    });

    it("returns invalid_temporal_arm with zero debug weights for non-finite inputs", () => {
        const temporal = createTemporal("right", {
            reach: Number.NaN,
        });

        const result = createTemporalArmIkInput({
            temporal,
            side: "right",
            profile: PROFILE,
            solver: SOLVER,
        });

        expect(result.target).toBeUndefined();
        expect(result.reasonCodes).toEqual(["invalid_temporal_arm"]);
        expect(result.debug.weightBeforeStateScale).toBe(0);
        expect(result.debug.weightAfterStateScale).toBe(0);
    });

    it("rejects unknown temporal arm states from runtime boundaries", () => {
        const temporal = createTemporal("right", {});
        Object.defineProperty(temporal.arms.right, "state", {
            value: "unknown_state",
        });

        const result = createTemporalArmIkInput({
            temporal,
            side: "right",
            profile: PROFILE,
            solver: SOLVER,
        });

        expect(result.target).toBeUndefined();
        expect(result.sourceState).toBe("lost");
        expect(result.reasonCodes).toEqual(["invalid_temporal_arm"]);
    });
});
