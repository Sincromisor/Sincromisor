import { describe, expect, it } from "vitest";
import {
    generateTemporalArmRecoveryFixture,
    type TemporalArmRecoveryFixtureId,
} from "../fixtures/temporalArmRecoveryFixture";
import { parseMotionDebugLogLines } from "../motionDebugLogSchema";
import { parsePhase6Solver, parseTemporal } from "../motionMetricFrameParsers";
import { calculateMotionMetricSummary } from "../motionMetrics";

const FIXTURE_IDS: TemporalArmRecoveryFixtureId[] = [
    "left-arm-occlusion-recovery",
    "right-arm-occlusion-recovery",
];

describe("temporal arm recovery fixture", () => {
    it.each(FIXTURE_IDS)("generates deterministic production recovery for %s", (fixtureId) => {
        const first = generateTemporalArmRecoveryFixture(fixtureId);
        expect(generateTemporalArmRecoveryFixture(fixtureId)).toBe(first);
        const parsed = parseMotionDebugLogLines(first.trimEnd().split("\n"));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error("Generated fixture must parse.");

        const targetSide = fixtureId.startsWith("left") ? "left" : "right";
        const otherSide = targetSide === "left" ? "right" : "left";
        const states = parsed.frames.map((frame) => {
            const temporal = parseTemporal(frame);
            if (temporal === undefined) {
                throw new Error("Generated frame must contain temporal arms.");
            }
            return temporal.arms[targetSide].state;
        });
        expect(parsed.frames).toHaveLength(64);
        expect(states.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => "tracked"));
        expect(states.filter((state) => state === "lost").length).toBeGreaterThanOrEqual(5);
        expect(states.filter((state) => state === "recovering").length).toBeGreaterThanOrEqual(2);
        expect(states.slice(-10)).toEqual(Array.from({ length: 10 }, () => "tracked"));

        let previousTimestamp = -1;
        for (const frame of parsed.frames) {
            expect(frame.timestamp.mediaTimeMs).toBeGreaterThan(previousTimestamp);
            previousTimestamp = frame.timestamp.mediaTimeMs;
            const temporal = parseTemporal(frame);
            const phase6 = parsePhase6Solver(frame);
            if (temporal === undefined || phase6 === undefined) {
                throw new Error("Generated frame layers must parse.");
            }
            expect(temporal.arms[otherSide].state).toBe("tracked");
            const source = phase6.arms[targetSide].source?.primarySource;
            if (temporal.arms[targetSide]?.state === "lost") {
                expect(source).toBe("pose-snapshot-fallback");
            }
            if (temporal.arms[targetSide]?.state === "recovering") {
                expect(source).toBe("temporal");
            }
        }

        const summary = calculateMotionMetricSummary(parsed.frames, {
            fixtureId,
            generatedAtIso: "2026-07-12T00:00:00.000Z",
            thresholdVersion: "initial-v1",
        });
        expect(summary.metrics.temporalRecoveringArmFrameCount.value).toBeGreaterThanOrEqual(2);
        expect(summary.metrics.temporalMaxRecoveryJumpDegEquivalent).toMatchObject({
            status: "pass",
        });
        expect(summary.metrics.recoveryJumpAngleDeg.value).toBeLessThanOrEqual(18);
        expect(summary.metrics.solverElbowFlipRejectCount.value).toBeLessThanOrEqual(2);
        expect(summary.metrics.finalPoseAngularVelocityClampCount.value).toBeLessThanOrEqual(3);
        expect(summary.metrics.finalPoseOwnedBoneConflictCount.value).toBe(0);
    });
});
