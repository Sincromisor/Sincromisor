import { describe, expect, it } from "vitest";
import {
    type CanonicalCalibrationSnapshot,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "../../canonical/canonicalUpperBodyState";
import {
    createCanonicalCalibrationFromOnlineState,
    evaluateOnlineCalibrationGate,
    type OnlineCalibrationFreezeReason,
    type OnlineCalibrationGateInput,
    type OnlineCalibrationSample,
    type OnlineSincroCalibrationState,
    parseOnlineSincroCalibrationState,
    SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION,
    updateOnlineCalibrationState,
} from "../onlineSincroCalibration";

describe("online sincro calibration", () => {
    it("opens the gate when all guard metrics are inside thresholds", () => {
        expect(evaluateOnlineCalibrationGate(createOpenGate())).toEqual({
            open: true,
            freezeReasons: [],
        });
    });

    it("reports each gate freeze reason", () => {
        const scenarios: Array<{
            override: Partial<OnlineCalibrationGateInput>;
            reason: OnlineCalibrationFreezeReason;
        }> = [
            { override: { torsoReliability: 0.85 }, reason: "torso_low_reliability" },
            { override: { headReliability: 0.8 }, reason: "head_low_reliability" },
            { override: { bothShouldersVisible: false }, reason: "shoulders_not_visible" },
            { override: { borderRisk: 0.3 }, reason: "border_risk" },
            { override: { motionBlurRisk: 0.5 }, reason: "motion_blur" },
            { override: { armActivity: 0.2 }, reason: "arm_activity_high" },
            { override: { faceYawAbsRad: (12 * Math.PI) / 180 }, reason: "face_yaw_not_neutral" },
            { override: { boneLengthConsistency: 0.8 }, reason: "bone_length_inconsistent" },
        ];

        for (const scenario of scenarios) {
            const result = evaluateOnlineCalibrationGate({
                ...createOpenGate(),
                ...scenario.override,
            });

            expect(result.open).toBe(false);
            expect(result.freezeReasons).toContain(scenario.reason);
        }
    });

    it("resets candidate and keeps committed calibration when the gate closes", () => {
        const state = createState({
            candidate: createCandidate(1000, 1400),
            committed: createCommitted(900),
        });
        const updated = updateOnlineCalibrationState(
            state,
            createSample(1500, { gate: { ...createOpenGate(), borderRisk: 0.5 } }),
        );

        expect(updated.candidate).toBeUndefined();
        expect(updated.committed).toEqual(state.committed);
        expect(updated.freezeReasons).toEqual(["border_risk"]);
    });

    it("keeps a gate-open sample as candidate until the stable duration reaches 3000ms", () => {
        const updated = updateOnlineCalibrationState(
            createState(),
            createSample(1000, { shoulderWidth: 1.1 }),
        );

        expect(updated.candidate?.shoulderWidth).toBe(1.1);
        expect(updated.candidate?.stableDurationMs).toBe(0);
        expect(updated.committed).toBeUndefined();
        expect(updated.freezeReasons).toEqual(["candidate_not_stable"]);
    });

    it("does not update candidate when media time does not increase", () => {
        const state = createState({ candidate: createCandidate(1000, 1000) });
        const updated = updateOnlineCalibrationState(
            state,
            createSample(1000, { shoulderWidth: 1.14 }),
        );

        expect(updated.candidate).toEqual(state.candidate);
        expect(updated.freezeReasons).toEqual(["candidate_not_stable"]);
    });

    it("promotes a candidate after 3000ms of continuous gate-open samples", () => {
        const state = createState({ candidate: createCandidate(1000, 1000) });
        const updated = updateOnlineCalibrationState(
            state,
            createSample(3000, { shoulderWidth: 1.15 }),
        );

        expect(updated.candidate?.stableDurationMs).toBe(3000);
        expect(updated.committed).toMatchObject({
            id: "online-calibration:3000",
            source: "online",
            capturedAtMediaTimeMs: 3000,
            updatedAtMediaTimeMs: 3000,
        });
        expect(updated.freezeReasons).toEqual([]);
    });

    it("clamps drift without discarding the candidate", () => {
        const updated = updateOnlineCalibrationState(
            createState(),
            createSample(1000, {
                neutralYawRad: Math.PI,
                shoulderWidth: 2,
                torsoScale: 2,
                handBaseline: {
                    left: { palmSize: 2, openSpread: 2 },
                    right: { palmSize: 2, openSpread: 2 },
                },
            }),
        );

        expect(updated.candidate?.neutralYawRad).toBeCloseTo((10 * Math.PI) / 180);
        expect(updated.candidate?.shoulderWidth).toBe(1.15);
        expect(updated.candidate?.torsoScale).toBe(1.2);
        expect(updated.candidate?.handBaseline.left.palmSize).toBe(1.2);
        expect(updated.freezeReasons).toEqual(["candidate_not_stable", "drift_clamped"]);
    });

    it("uses configured EMA tau values after the first candidate sample", () => {
        const state = createState({ candidate: createCandidate(1000, 0) });
        const updated = updateOnlineCalibrationState(
            state,
            createSample(1000, {
                neutralYawRad: 0.1,
                shoulderWidth: 1.15,
                torsoScale: 1.2,
                handBaseline: {
                    left: { palmSize: 1.2, openSpread: 1.2 },
                    right: { palmSize: 1.2, openSpread: 1.2 },
                },
            }),
        );

        expect(updated.candidate?.shoulderWidth).toBeCloseTo(1 + 0.15 * emaAlpha(1, 120));
        expect(updated.candidate?.torsoScale).toBeCloseTo(1 + 0.2 * emaAlpha(1, 120));
        expect(updated.candidate?.neutralYawRad).toBeCloseTo(0.1 * emaAlpha(1, 90));
        expect(updated.candidate?.handBaseline.left.palmSize).toBeCloseTo(
            1 + 0.2 * emaAlpha(1, 20),
        );
    });

    it("creates canonical online snapshot from committed state and clones initial without committed", () => {
        const initialOnly = createState();
        const initialClone = createCanonicalCalibrationFromOnlineState(initialOnly);
        initialClone.handBaseline.left.palmSize = 9;

        expect(initialOnly.initial.handBaseline.left.palmSize).toBe(1);
        expect(
            createCanonicalCalibrationFromOnlineState(
                createState({ committed: createCommitted(2500) }),
            ),
        ).toEqual({
            id: "online-calibration:2500",
            source: "online",
            neutralYawRad: 0,
            shoulderWidth: 1,
            torsoScale: 1,
            handBaseline: {
                left: { palmSize: 1, openSpread: 1 },
                right: { palmSize: 1, openSpread: 1 },
            },
            capturedAtMediaTimeMs: 2500,
        });
    });

    it("rejects invalid persisted online states", () => {
        const valid = createState();
        const cases: unknown[] = [
            { ...valid, schemaVersion: "sincro.online-calibration.v0" },
            { ...valid, freezeReasons: ["unknown_reason"] },
            { ...valid, candidate: { ...createCandidate(1000, 0), stableDurationMs: -1 } },
            { ...valid, initial: { ...valid.initial, shoulderWidth: Number.NaN } },
            { ...valid, extra: true },
            { ...valid, initial: new Date() },
            { ...valid, initial: new RuntimeCalibrationSnapshot() },
        ];

        for (const value of cases) {
            expect(parseOnlineSincroCalibrationState(value).ok).toBe(false);
        }
        const negativeDuration = parseOnlineSincroCalibrationState({
            ...valid,
            candidate: { ...createCandidate(1000, 0), stableDurationMs: -1 },
        });
        expect(negativeDuration.ok).toBe(false);
        if (!negativeDuration.ok) {
            expect(negativeDuration.errors[0]?.code).toBe("out_of_range");
        }
    });
});

function createState(
    overrides: Partial<OnlineSincroCalibrationState> = {},
): OnlineSincroCalibrationState {
    return {
        schemaVersion: SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION,
        initial: createInitialCalibration(),
        freezeReasons: [],
        ...overrides,
    };
}

function createInitialCalibration(): CanonicalCalibrationSnapshot {
    return {
        ...DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
        id: "initial",
        source: "initial",
        capturedAtMediaTimeMs: 0,
        handBaseline: {
            left: { palmSize: 1, openSpread: 1 },
            right: { palmSize: 1, openSpread: 1 },
        },
    };
}

function createCandidate(
    stableDurationMs: number,
    capturedAtMediaTimeMs: number,
): OnlineSincroCalibrationState["candidate"] {
    return {
        ...createInitialCalibration(),
        id: `online-candidate:${capturedAtMediaTimeMs}`,
        source: "online",
        capturedAtMediaTimeMs,
        stableDurationMs,
    };
}

function createCommitted(
    mediaTimeMs: number,
): NonNullable<OnlineSincroCalibrationState["committed"]> {
    return {
        ...createInitialCalibration(),
        id: `online-calibration:${mediaTimeMs}`,
        source: "online",
        capturedAtMediaTimeMs: mediaTimeMs,
        updatedAtMediaTimeMs: mediaTimeMs,
    };
}

function createSample(
    mediaTimeMs: number,
    overrides: Partial<Omit<OnlineCalibrationSample, "mediaTimeMs">> = {},
): OnlineCalibrationSample {
    return {
        mediaTimeMs,
        gate: createOpenGate(),
        ...overrides,
    };
}

function createOpenGate(): OnlineCalibrationGateInput {
    return {
        torsoReliability: 0.95,
        headReliability: 0.9,
        bothShouldersVisible: true,
        borderRisk: 0.1,
        motionBlurRisk: 0.1,
        armActivity: 0.1,
        faceYawAbsRad: 0.05,
        boneLengthConsistency: 0.95,
    };
}

function emaAlpha(dtSec: number, tauSec: number): number {
    return 1 - Math.exp(-dtSec / tauSec);
}

class RuntimeCalibrationSnapshot {
    id = "runtime";
    source = "initial" as const;
    neutralYawRad = 0;
    shoulderWidth = 1;
    torsoScale = 1;
    handBaseline = {
        left: { palmSize: 1, openSpread: 1 },
        right: { palmSize: 1, openSpread: 1 },
    };
}
