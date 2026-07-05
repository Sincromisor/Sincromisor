/**
 * motion-debug viewer の Phase 6 / 7 / 9 solver layer を解決する。
 *
 * replay frame では保存済み sublayer を strict parse し、live では runtime snapshot から Phase 6 と
 * Phase 7 の表示値を作る。各 parser 失敗は sublayer 単位の invalid として保持する。
 */
import {
    type MotionDebugPhase6SolverSnapshot,
    parseMotionDebugPhase6SolverSnapshot,
} from "../../character/motionEvaluation/motionDebugPhase6Snapshot";
import {
    type MotionDebugPhase7Snapshot,
    parseMotionDebugPhase7Snapshot,
} from "../../character/motionEvaluation/motionDebugPhase7Snapshot";
import {
    type MotionDebugPhase9SemanticSnapshot,
    parseMotionDebugPhase9SemanticSnapshot,
} from "../../character/motionEvaluation/motionDebugPhase9Snapshot";
import { createMotionDebugLivePhase6SolverSnapshot } from "./motionDebugPhase6Snapshots";
import type { MotionDebugViewerContext } from "./motionDebugViewerModel";
import type { SolverLayerParseError, SolverLayerValue } from "./types";

/**
 * solver layer の Phase 6 / 7 / 9 sublayer 値を解決する。
 *
 * replay frame がある場合は live fallback を使わず保存 slot だけを見る。parser 失敗は throw せず
 * sublayer の `invalid` として返すため、viewer は他 sublayer と並べて破損箇所を表示できる。
 */
export function resolveSolverValue(context: MotionDebugViewerContext): SolverLayerValue {
    if (context.replayFrame !== undefined) {
        return {
            phase6: parsePhase6SolverSubLayer(resolveReplayPhase6SolverValue(context.replayFrame)),
            phase7: parsePhase7SolverSubLayer(resolveReplayPhase7SolverValue(context.replayFrame)),
            phase9: parsePhase9SolverSubLayer(resolveReplayPhase9SolverValue(context.replayFrame)),
        };
    }
    return {
        phase6: createAvailableSolverSubLayer(
            createMotionDebugLivePhase6SolverSnapshot(context.liveSnapshot.poseRetargetRuntime),
        ),
        phase7: createAvailableSolverSubLayer(context.liveSnapshot.phase7),
        phase9: createAvailableSolverSubLayer(undefined),
    };
}

function resolveReplayPhase6SolverValue(frame: { solver?: unknown }): unknown | undefined {
    if (!isRecord(frame.solver)) {
        return undefined;
    }
    return frame.solver.phase6;
}

function resolveReplayPhase7SolverValue(frame: { solver?: unknown }): unknown | undefined {
    if (!isRecord(frame.solver)) {
        return undefined;
    }
    return frame.solver.phase7;
}

function resolveReplayPhase9SolverValue(frame: { solver?: unknown }): unknown | undefined {
    if (!isRecord(frame.solver)) {
        return undefined;
    }
    return frame.solver.phase9;
}

function parsePhase6SolverSubLayer(value: unknown): SolverLayerValue["phase6"] {
    if (value === undefined) {
        return { status: "not_recorded" };
    }
    const parsed = parsePhase6SolverLayerValue(value);
    if (isSolverLayerParseError(parsed)) {
        return { status: "invalid", value: parsed };
    }
    return { status: "available", value: parsed };
}

function parsePhase7SolverSubLayer(value: unknown): SolverLayerValue["phase7"] {
    if (value === undefined) {
        return { status: "not_recorded" };
    }
    const parsed = parsePhase7SolverLayerValue(value);
    if (isSolverLayerParseError(parsed)) {
        return { status: "invalid", value: parsed };
    }
    return { status: "available", value: parsed };
}

function parsePhase9SolverSubLayer(value: unknown): SolverLayerValue["phase9"] {
    if (value === undefined) {
        return { status: "not_recorded" };
    }
    const parsed = parsePhase9SolverLayerValue(value);
    if (isSolverLayerParseError(parsed)) {
        return { status: "invalid", value: parsed };
    }
    return { status: "available", value: parsed };
}

function createAvailableSolverSubLayer(
    value:
        | MotionDebugPhase6SolverSnapshot
        | MotionDebugPhase7Snapshot
        | MotionDebugPhase9SemanticSnapshot
        | undefined,
): SolverLayerValue["phase6"] | SolverLayerValue["phase7"] | SolverLayerValue["phase9"] {
    if (value === undefined) {
        return { status: "not_recorded" };
    }
    return { status: "available", value };
}

function parsePhase6SolverLayerValue(
    value: unknown,
): MotionDebugPhase6SolverSnapshot | SolverLayerParseError {
    const parsed = parseMotionDebugPhase6SolverSnapshot(value);
    if (parsed.ok) {
        return parsed.snapshot;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function parsePhase7SolverLayerValue(
    value: unknown,
): MotionDebugPhase7Snapshot | SolverLayerParseError {
    const parsed = parseMotionDebugPhase7Snapshot(value);
    if (parsed.ok) {
        return parsed.snapshot;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function parsePhase9SolverLayerValue(
    value: unknown,
): MotionDebugPhase9SemanticSnapshot | SolverLayerParseError {
    const parsed = parseMotionDebugPhase9SemanticSnapshot(value);
    if (parsed.ok) {
        return parsed.snapshot;
    }
    return {
        parseStatus: "invalid",
        errors: parsed.errors,
        raw: value,
    };
}

function isSolverLayerParseError(value: unknown): value is SolverLayerParseError {
    return isRecord(value) && value.parseStatus === "invalid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
