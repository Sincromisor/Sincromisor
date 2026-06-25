import { Vector3 } from "three/src/math/Vector3.js";
import { describe, expect, it } from "vitest";

import { resolveArmIkPoleDirection } from "../sincroArmIkPole";

const TARGET = new Vector3(1, 0, 0);
const BIND_POLE = new Vector3(0, 1, 0);
const POLE_FLIP_DOT_THRESHOLD = -0.08;

function resolvePole(options: {
    elbowPole: Vector3;
    previousPoleDirection?: Vector3;
    temporalState?: "tracked" | "suspect" | "predicted" | "lost" | "recovering";
    elbowFlexionRad?: number;
    recoveringBlendProgress?: number;
    targetReachRatio?: number;
}) {
    return resolveArmIkPoleDirection({
        elbowPole: options.elbowPole,
        target: TARGET,
        bindPoleDirection: BIND_POLE,
        previousPoleDirection: options.previousPoleDirection,
        poleFlipDotThreshold: POLE_FLIP_DOT_THRESHOLD,
        temporalState: options.temporalState,
        elbowFlexionRad: options.elbowFlexionRad,
        recoveringBlendProgress: options.recoveringBlendProgress,
        targetReachRatio: options.targetReachRatio,
    });
}

function expectVectorClose(actual: Vector3, expected: Vector3) {
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.z).toBeCloseTo(expected.z, 6);
}

function normalizedBlend(from: Vector3, to: Vector3, alpha: number): Vector3 {
    return from.clone().lerp(to, alpha).normalize();
}

describe("resolveArmIkPoleDirection", () => {
    it("keeps a usable measured pole stable", () => {
        const measured = new Vector3(0, 0.9, 0.2).normalize();
        const pole = resolvePole({ elbowPole: measured, previousPoleDirection: BIND_POLE });

        expect(pole.state).toBe("stable");
        expect(pole.stabilized).toBe(false);
        expect(pole.reasonCodes).toEqual([]);
        expect(pole.blendWeight).toBe(1);
        expect(pole.weightScale).toBe(1);
        expectVectorClose(pole.direction, measured);
    });

    it("hard rejects a flipped candidate as uncertain and downweights it", () => {
        const previous = new Vector3(0, 0, 1);
        const fallback = BIND_POLE;
        const pole = resolvePole({
            elbowPole: new Vector3(0, 0, -1),
            previousPoleDirection: previous,
        });

        expect(pole.state).toBe("uncertain");
        expect(pole.stabilized).toBe(true);
        expect(pole.reasonCodes).toEqual(["pole_flip_rejected"]);
        expect(pole.blendWeight).toBeCloseTo(0.3);
        expect(pole.weightScale).toBeCloseTo(0.68);
        expectVectorClose(pole.direction, normalizedBlend(previous, fallback, 0.3));
    });

    it("treats extended arms as previous-to-fallback blend", () => {
        const previous = new Vector3(0, 0, 1);
        const pole = resolvePole({
            elbowPole: new Vector3(0, 0.9, 0.2).normalize(),
            previousPoleDirection: previous,
            elbowFlexionRad: 0.1,
        });

        expect(pole.state).toBe("extended");
        expect(pole.blendWeight).toBeCloseTo(0.5);
        expectVectorClose(pole.direction, normalizedBlend(previous, BIND_POLE, 0.5));
    });

    it("treats near full reach as extended", () => {
        const previous = new Vector3(0, 0, 1);
        const pole = resolvePole({
            elbowPole: new Vector3(0, 0.9, 0.2).normalize(),
            previousPoleDirection: previous,
            targetReachRatio: 0.97,
        });

        expect(pole.state).toBe("extended");
        expectVectorClose(pole.direction, normalizedBlend(previous, BIND_POLE, 0.5));
    });

    it("keeps lost temporal input on the previous pole", () => {
        const previous = new Vector3(0, 0, 1);
        const pole = resolvePole({
            elbowPole: new Vector3(0, 1, 0),
            previousPoleDirection: previous,
            temporalState: "lost",
        });

        expect(pole.state).toBe("lost");
        expect(pole.blendWeight).toBe(0);
        expectVectorClose(pole.direction, previous);
    });

    it("keeps lost temporal input on previous pole when measured pole is unusable", () => {
        const previous = new Vector3(0, 0, 1);
        const pole = resolvePole({
            elbowPole: TARGET,
            previousPoleDirection: previous,
            temporalState: "lost",
        });

        expect(pole.state).toBe("lost");
        expect(pole.blendWeight).toBe(0);
        expect(pole.weightScale).toBe(1);
        expectVectorClose(pole.direction, previous);
    });

    it("uses bind pole as previous when measured pole is unusable and previous is missing", () => {
        const pole = resolvePole({
            elbowPole: TARGET,
            temporalState: "lost",
        });

        expect(pole.state).toBe("lost");
        expectVectorClose(pole.direction, BIND_POLE);
    });

    it("blends recovering temporal input from previous to measured pole", () => {
        const previous = new Vector3(0, 0, 1);
        const measured = new Vector3(0, 1, 0);
        const pole = resolvePole({
            elbowPole: measured,
            previousPoleDirection: previous,
            temporalState: "recovering",
            recoveringBlendProgress: 0.25,
        });

        expect(pole.state).toBe("recovering");
        expect(pole.blendWeight).toBeCloseTo(0.25);
        expectVectorClose(pole.direction, normalizedBlend(previous, measured, 0.25));
    });

    it("soft downweights at the hard reject boundary", () => {
        const pole = resolvePole({
            elbowPole: new Vector3(
                0,
                POLE_FLIP_DOT_THRESHOLD,
                Math.sqrt(1 - POLE_FLIP_DOT_THRESHOLD ** 2),
            ),
            previousPoleDirection: BIND_POLE,
        });

        expect(pole.state).toBe("stable");
        expect(pole.reasonCodes).toEqual(["pole_uncertain_downweighted"]);
        expect(pole.weightScale).toBeCloseTo(0.82);
    });

    it("does not soft downweight at the upper soft boundary", () => {
        const pole = resolvePole({
            elbowPole: new Vector3(0, 0.18, Math.sqrt(1 - 0.18 ** 2)),
            previousPoleDirection: BIND_POLE,
        });

        expect(pole.state).toBe("stable");
        expect(pole.reasonCodes).toEqual([]);
        expect(pole.weightScale).toBe(1);
    });
});
