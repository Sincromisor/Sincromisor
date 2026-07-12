import type { CanonicalCalibrationSnapshot } from "../canonical/canonicalUpperBodyState";
import { evaluateOnlineCalibrationGate } from "./onlineSincroCalibrationGate";
import {
    cloneCalibrationSnapshot,
    cloneCommittedSnapshot,
    cloneOnlineSincroCalibrationState,
    createClosedGateState,
    createCommittedSnapshot,
} from "./onlineSincroCalibrationSnapshots";
import {
    ONLINE_CALIBRATION_HAND_BASELINE_TAU_SEC,
    ONLINE_CALIBRATION_NEUTRAL_YAW_DRIFT_LIMIT_RAD,
    ONLINE_CALIBRATION_NEUTRAL_YAW_TAU_SEC,
    ONLINE_CALIBRATION_PROMOTION_STABLE_DURATION_MS,
    ONLINE_CALIBRATION_SHOULDER_BODY_TAU_SEC,
    type OnlineCalibrationCandidateSnapshot,
    type OnlineCalibrationFreezeReason,
    type OnlineCalibrationSample,
    type OnlineSincroCalibrationState,
    SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION,
} from "./onlineSincroCalibrationTypes";

export function updateOnlineCalibrationState(
    state: OnlineSincroCalibrationState,
    sample: OnlineCalibrationSample,
): OnlineSincroCalibrationState {
    const gate = evaluateOnlineCalibrationGate(sample);
    if (!gate.open) {
        return createClosedGateState(state, gate.freezeReasons);
    }
    if (
        state.candidate?.capturedAtMediaTimeMs !== undefined &&
        sample.mediaTimeMs <= state.candidate.capturedAtMediaTimeMs
    ) {
        return {
            ...cloneOnlineSincroCalibrationState(state),
            freezeReasons: ["candidate_not_stable"],
        };
    }

    const candidate = createNextCandidate(state, sample);
    const freezeReasons: OnlineCalibrationFreezeReason[] =
        candidate.driftClamped === true ? ["drift_clamped"] : [];
    if (candidate.snapshot.stableDurationMs < ONLINE_CALIBRATION_PROMOTION_STABLE_DURATION_MS) {
        freezeReasons.unshift("candidate_not_stable");
    }
    return {
        schemaVersion: SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION,
        initial: cloneCalibrationSnapshot(state.initial),
        candidate: candidate.snapshot,
        committed:
            candidate.snapshot.stableDurationMs >= ONLINE_CALIBRATION_PROMOTION_STABLE_DURATION_MS
                ? createCommittedSnapshot(candidate.snapshot, sample.mediaTimeMs)
                : state.committed === undefined
                  ? undefined
                  : cloneCommittedSnapshot(state.committed),
        freezeReasons,
    };
}

function createNextCandidate(
    state: OnlineSincroCalibrationState,
    sample: OnlineCalibrationSample,
): { snapshot: OnlineCalibrationCandidateSnapshot; driftClamped: boolean } {
    const previous = state.candidate ?? state.committed ?? state.initial;
    const previousMediaTimeMs = state.candidate?.capturedAtMediaTimeMs;
    const dtMs =
        previousMediaTimeMs === undefined
            ? 0
            : Math.max(0, sample.mediaTimeMs - previousMediaTimeMs);
    const stableDurationMs = (state.candidate?.stableDurationMs ?? 0) + dtMs;
    const direct = previousMediaTimeMs === undefined;
    const next = cloneCalibrationSnapshot(previous);
    next.id = `online-candidate:${sample.mediaTimeMs}`;
    next.source = "online";
    next.capturedAtMediaTimeMs = sample.mediaTimeMs;

    let driftClamped = false;
    const update = (
        current: number,
        observed: number | undefined,
        tauSec: number,
        min: number,
        max: number,
    ): number => {
        if (observed === undefined) return current;
        const clamped = clamp(observed, min, max);
        driftClamped ||= clamped !== observed;
        if (direct) return clamped;
        return current + (clamped - current) * emaAlpha(dtMs / 1000, tauSec);
    };

    next.neutralYawRad = update(
        previous.neutralYawRad,
        sample.neutralYawRad,
        ONLINE_CALIBRATION_NEUTRAL_YAW_TAU_SEC,
        state.initial.neutralYawRad - ONLINE_CALIBRATION_NEUTRAL_YAW_DRIFT_LIMIT_RAD,
        state.initial.neutralYawRad + ONLINE_CALIBRATION_NEUTRAL_YAW_DRIFT_LIMIT_RAD,
    );
    next.shoulderWidth = update(
        previous.shoulderWidth,
        sample.shoulderWidth,
        ONLINE_CALIBRATION_SHOULDER_BODY_TAU_SEC,
        state.initial.shoulderWidth * 0.85,
        state.initial.shoulderWidth * 1.15,
    );
    next.torsoScale = update(
        previous.torsoScale,
        sample.torsoScale,
        ONLINE_CALIBRATION_SHOULDER_BODY_TAU_SEC,
        state.initial.torsoScale * 0.8,
        state.initial.torsoScale * 1.2,
    );
    next.handBaseline = updateHandBaseline(previous, sample, state.initial, dtMs, direct, () => {
        driftClamped = true;
    });
    return { snapshot: { ...next, stableDurationMs }, driftClamped };
}

function updateHandBaseline(
    previous: CanonicalCalibrationSnapshot,
    sample: OnlineCalibrationSample,
    initial: CanonicalCalibrationSnapshot,
    dtMs: number,
    direct: boolean,
    onClamp: () => void,
): CanonicalCalibrationSnapshot["handBaseline"] {
    const alpha = direct ? 1 : emaAlpha(dtMs / 1000, ONLINE_CALIBRATION_HAND_BASELINE_TAU_SEC);
    const update = (
        current: number,
        observed: number | undefined,
        initialValue: number,
    ): number => {
        if (observed === undefined) return current;
        const clamped = clamp(observed, initialValue * 0.8, initialValue * 1.2);
        if (clamped !== observed) onClamp();
        return current + (clamped - current) * alpha;
    };
    return {
        left: {
            palmSize: update(
                previous.handBaseline.left.palmSize,
                sample.handBaseline?.left.palmSize,
                initial.handBaseline.left.palmSize,
            ),
            openSpread: update(
                previous.handBaseline.left.openSpread,
                sample.handBaseline?.left.openSpread,
                initial.handBaseline.left.openSpread,
            ),
        },
        right: {
            palmSize: update(
                previous.handBaseline.right.palmSize,
                sample.handBaseline?.right.palmSize,
                initial.handBaseline.right.palmSize,
            ),
            openSpread: update(
                previous.handBaseline.right.openSpread,
                sample.handBaseline?.right.openSpread,
                initial.handBaseline.right.openSpread,
            ),
        },
    };
}

function emaAlpha(dtSec: number, tauSec: number): number {
    return 1 - Math.exp(-dtSec / tauSec);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
