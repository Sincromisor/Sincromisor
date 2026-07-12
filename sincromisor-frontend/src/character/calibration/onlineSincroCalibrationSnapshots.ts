import type { CanonicalCalibrationSnapshot } from "../canonical/canonicalUpperBodyState";
import {
    type OnlineCalibrationCandidateSnapshot,
    type OnlineCalibrationCommittedSnapshot,
    type OnlineSincroCalibrationState,
    SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION,
} from "./onlineSincroCalibrationTypes";

export function cloneOnlineSincroCalibrationState(
    state: OnlineSincroCalibrationState,
): OnlineSincroCalibrationState {
    return {
        schemaVersion: state.schemaVersion,
        initial: cloneCalibrationSnapshot(state.initial),
        candidate:
            state.candidate === undefined ? undefined : cloneCandidateSnapshot(state.candidate),
        committed:
            state.committed === undefined ? undefined : cloneCommittedSnapshot(state.committed),
        freezeReasons: [...state.freezeReasons],
    };
}

export function createCanonicalCalibrationFromOnlineState(
    state: OnlineSincroCalibrationState,
): CanonicalCalibrationSnapshot {
    if (state.committed === undefined) {
        return cloneCalibrationSnapshot(state.initial);
    }
    const committed = state.committed;
    return {
        id: `online-calibration:${committed.updatedAtMediaTimeMs}`,
        source: "online",
        neutralYawRad: committed.neutralYawRad,
        shoulderWidth: committed.shoulderWidth,
        torsoScale: committed.torsoScale,
        handBaseline: cloneHandBaseline(committed.handBaseline),
        capturedAtMediaTimeMs: committed.updatedAtMediaTimeMs,
    };
}

export function createClosedGateState(
    state: OnlineSincroCalibrationState,
    freezeReasons: OnlineSincroCalibrationState["freezeReasons"],
): OnlineSincroCalibrationState {
    return {
        schemaVersion: SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION,
        initial: cloneCalibrationSnapshot(state.initial),
        committed:
            state.committed === undefined ? undefined : cloneCommittedSnapshot(state.committed),
        freezeReasons,
    };
}

export function createCommittedSnapshot(
    candidate: OnlineCalibrationCandidateSnapshot,
    mediaTimeMs: number,
): OnlineCalibrationCommittedSnapshot {
    return {
        id: `online-calibration:${mediaTimeMs}`,
        source: "online",
        neutralYawRad: candidate.neutralYawRad,
        shoulderWidth: candidate.shoulderWidth,
        torsoScale: candidate.torsoScale,
        handBaseline: cloneHandBaseline(candidate.handBaseline),
        capturedAtMediaTimeMs: mediaTimeMs,
        updatedAtMediaTimeMs: mediaTimeMs,
    };
}

export function cloneCandidateSnapshot(
    snapshot: OnlineCalibrationCandidateSnapshot,
): OnlineCalibrationCandidateSnapshot {
    return { ...cloneCalibrationSnapshot(snapshot), stableDurationMs: snapshot.stableDurationMs };
}

export function cloneCommittedSnapshot(
    snapshot: OnlineCalibrationCommittedSnapshot,
): OnlineCalibrationCommittedSnapshot {
    return {
        ...cloneCalibrationSnapshot(snapshot),
        updatedAtMediaTimeMs: snapshot.updatedAtMediaTimeMs,
    };
}

export function cloneCalibrationSnapshot(
    snapshot: CanonicalCalibrationSnapshot,
): CanonicalCalibrationSnapshot {
    return {
        id: snapshot.id,
        source: snapshot.source,
        neutralYawRad: snapshot.neutralYawRad,
        shoulderWidth: snapshot.shoulderWidth,
        torsoScale: snapshot.torsoScale,
        handBaseline: cloneHandBaseline(snapshot.handBaseline),
        capturedAtMediaTimeMs: snapshot.capturedAtMediaTimeMs,
    };
}

export function cloneHandBaseline(
    handBaseline: CanonicalCalibrationSnapshot["handBaseline"],
): CanonicalCalibrationSnapshot["handBaseline"] {
    return {
        left: { ...handBaseline.left },
        right: { ...handBaseline.right },
    };
}
