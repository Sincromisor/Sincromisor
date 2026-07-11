import { describe, expect, it } from "vitest";
import { createDefaultPoseMotionSnapshot } from "../../../features/debug/model/debugConsoleMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { MinimalAvatarMotionProfile } from "../../avatarProfile/minimalAvatarMotionProfile";
import type { SincroArmIkConstraintSnapshot } from "../../ik/sincroArmIkConstraint";
import type { SincroArmIkSolveResult } from "../../ik/sincroArmIkSolver";
import type { SincroArmIkTarget } from "../../ik/sincroArmIkTypes";
import {
    createDefaultTemporalUpperBodyState,
    type TemporalUpperBodyState,
} from "../../temporal/temporalUpperBodyState";
import { SincroPoseRetargeter } from "../sincroPoseRetargeter";
import { createSincroPoseTemporalArmInput } from "../sincroPoseTemporalArmInput";

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
        headSize: 0.3,
    },
    torso: {
        distribution: { spine: 0.25, chest: 0.4, upperChest: 0.35 },
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

const SOLVER_MEASUREMENTS = {
    shoulderWidth: 0.8,
    upperArmLength: 0.4,
    lowerArmLength: 0.6,
};

describe("createSincroPoseTemporalArmInput", () => {
    it("keeps temporal/profile/solver missing reasons individually for fallback debug", () => {
        const result = createSincroPoseTemporalArmInput({
            snapshot: createTrackedPoseSnapshot(),
            side: "left",
        });

        expect(result.target).toBeUndefined();
        expect(result.source).toEqual({
            primarySource: "pose-snapshot-fallback",
            fallbackReason: "temporal_input_missing",
            bridgeReasonCodes: [
                "temporal_input_missing",
                "avatar_profile_missing",
                "ik_solver_missing",
            ],
        });
    });

    it("returns temporal primary source when the bridge creates a target", () => {
        const result = createSincroPoseTemporalArmInput({
            snapshot: createTrackedPoseSnapshot(),
            temporal: createTemporalState(),
            profile: PROFILE,
            solver: SOLVER_MEASUREMENTS,
            side: "right",
        });

        expect(result.target).toBeDefined();
        expect(result.source.primarySource).toBe("temporal");
        expect(result.source.bridgeReasonCodes).toEqual([]);
        expect(result.source.temporalState).toBe("tracked");
        expect(result.source.targetReachRatio).toBeGreaterThan(0);
    });
});

describe("SincroPoseRetargeter temporal arm production input", () => {
    it("uses temporal primary even when pose arm tracking is unavailable", () => {
        let capturedTarget: SincroArmIkTarget | undefined;
        const retargeter = new SincroPoseRetargeter();
        Object.defineProperty(retargeter, "armIkSolvers", {
            value: {
                left: createFakeSolver((target) => {
                    capturedTarget = target;
                }),
                right: createFakeSolver((target) => {
                    capturedTarget = target;
                }),
            },
        });

        const frame = retargeter.retarget(createTrackedPoseSnapshot(), 1000, {
            temporal: createTemporalState(),
            profile: PROFILE,
        });

        expect(capturedTarget).toBeDefined();
        expect(capturedTarget?.wrist.length()).toBeCloseTo(0.5, 6);
        expect(capturedTarget?.wrist.x).toBeGreaterThan(0);
        expect(frame.rightArm.ikActive).toBe(true);
        expect(frame.rightArm.solverSource).toMatchObject({
            primarySource: "temporal",
            temporalState: "tracked",
        });
    });

    it("falls back to pose snapshot source when temporal input is absent", () => {
        const retargeter = new SincroPoseRetargeter();
        Object.defineProperty(retargeter, "armIkSolvers", {
            value: {
                left: createFakeSolver(() => {}),
                right: createFakeSolver(() => {}),
            },
        });

        const frame = retargeter.retarget(createTrackedPoseSnapshot(), 1000, {
            profile: PROFILE,
        });

        expect(frame.leftArm.solverSource).toMatchObject({
            primarySource: "pose-snapshot-fallback",
            fallbackReason: "temporal_input_missing",
            bridgeReasonCodes: ["temporal_input_missing"],
        });
    });
});

function createTrackedPoseSnapshot(): SincroPoseMotionSnapshot {
    return {
        ...createDefaultPoseMotionSnapshot(),
        trackingEnabled: true,
        detected: true,
        confidence: 1,
    };
}

function createTemporalState(): TemporalUpperBodyState {
    const temporal = createDefaultTemporalUpperBodyState(1000);
    temporal.arms.right = {
        ...temporal.arms.right,
        state: "tracked",
        confidence: 0.8,
        source: "canonical",
        warnings: [],
        reach: 0.5,
        elevationRad: 0,
        openness: 0.4,
        forwardness: 0.3,
        elbowFlexionRad: 1,
        bodyLocalWrist: [0.9, 0.2, 0.3],
        bodyLocalElbow: [0.7, 0.1, 0.2],
        classification: "front",
        velocity: {
            reachPerSec: 0,
            elevationRadPerSec: 0,
            opennessPerSec: 0,
            forwardnessPerSec: 0,
            elbowFlexionRadPerSec: 0,
        },
    };
    return temporal;
}

function createFakeSolver(onSolve: (target: SincroArmIkTarget) => void): {
    shoulderWidth: number;
    upperArmLength: number;
    lowerArmLength: number;
    solve: (target: SincroArmIkTarget) => SincroArmIkSolveResult;
} {
    return {
        shoulderWidth: SOLVER_MEASUREMENTS.shoulderWidth,
        upperArmLength: SOLVER_MEASUREMENTS.upperArmLength,
        lowerArmLength: SOLVER_MEASUREMENTS.lowerArmLength,
        solve: (target) => {
            onSolve(target);
            return createIkSolveResult(target);
        },
    };
}

function createIkSolveResult(target: SincroArmIkTarget): SincroArmIkSolveResult {
    return {
        upperArmQuaternion: { x: 0, y: 0, z: 0, w: 1 },
        lowerArmQuaternion: { x: 0, y: 0, z: 0, w: 1 },
        neutralUpperArmQuaternion: { x: 0, y: 0, z: 0, w: 1 },
        neutralLowerArmQuaternion: { x: 0, y: 0, z: 0, w: 1 },
        targetClamped: target.targetReachRatio !== undefined && target.targetReachRatio > 0.98,
        constraint: createConstraint(),
        weight: target.weight,
    };
}

function createConstraint(): SincroArmIkConstraintSnapshot {
    return {
        reasons: [],
        jointLimited: false,
        poleStabilized: false,
        collisionAvoided: false,
        weightScale: 1,
        targetPushDistance: 0,
    };
}
