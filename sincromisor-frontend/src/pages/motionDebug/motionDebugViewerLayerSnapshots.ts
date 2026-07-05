/**
 * motion-debug viewer layer の status 変換を担う。
 *
 * replay log の欠損、未実装予約、parser error、metrics 未計算を同じ `MotionDebugLayerSnapshot`
 * contract に正規化する。値解決や parser 呼び出しは各 resolver module の責務であり、この module は
 * 受け取った値の表示 status だけを決める。
 */
import {
    getMotionDebugLayerLabel,
    isMotionDebugPhase1ReservedLayer,
} from "./motionDebugViewerCatalog";
import type { MotionDebugLayerKey, MotionDebugLayerSnapshot, SolverLayerValue } from "./types";

/**
 * raw layer 値を viewer snapshot status へ変換する。
 *
 * `undefined` と空 plain object は未記録扱いにするが、`null` や配列は保存済み値として扱う。旧 log の
 * JSON layer 表示で `null` が意味を持ち得るため、欠損判定を広げない。
 */
export function createLayerSnapshot(
    key: MotionDebugLayerKey,
    value: unknown,
    phase1Reserved: boolean,
): MotionDebugLayerSnapshot {
    if (hasRecordedValue(value)) {
        return {
            status: "available",
            label: getMotionDebugLayerLabel(key),
            value,
        };
    }
    return {
        status:
            phase1Reserved || isMotionDebugPhase1ReservedLayer(key)
                ? "not_implemented"
                : "not_recorded",
        label: getMotionDebugLayerLabel(key),
    };
}

/**
 * parser error wrapper を `invalid` status として扱う layer snapshot を作る。
 *
 * resolver は throw せず `{ parseStatus: "invalid", errors, raw }` を返すため、この関数が
 * viewer-facing の失敗 status に変換する。副作用はない。
 */
export function createParsedLayerSnapshot(
    key: MotionDebugLayerKey,
    value: unknown,
): MotionDebugLayerSnapshot {
    if (isInvalidLayerValue(value)) {
        return {
            status: "invalid",
            label: getMotionDebugLayerLabel(key),
            value,
        };
    }
    return createLayerSnapshot(key, value, false);
}

/**
 * Phase 6 / 7 / 9 solver sublayer を solver layer の status に集約する。
 *
 * いずれかの sublayer が `available` または `invalid` なら solver layer 全体は表示可能な診断情報を持つ。
 * 全 sublayer が `not_recorded` の場合だけ `not_recorded` にする。
 */
export function createSolverLayerSnapshot(value: SolverLayerValue): MotionDebugLayerSnapshot {
    if (
        value.phase6.status === "not_recorded" &&
        value.phase7.status === "not_recorded" &&
        value.phase9.status === "not_recorded"
    ) {
        return {
            status: "not_recorded",
            label: getMotionDebugLayerLabel("solver"),
        };
    }
    return {
        status: "available",
        label: getMotionDebugLayerLabel("solver"),
        value,
    };
}

/**
 * recording slot が viewer に表示できる値を持つか判定する。
 *
 * `undefined` と空 plain object だけを欠損扱いにする。旧 JSON contract では `null` が明示値として
 * 保存され得るため、ここでは欠損に含めない。
 */
export function hasRecordedValue(value: unknown): boolean {
    if (value === undefined) {
        return false;
    }
    if (!isRecord(value)) {
        return true;
    }
    return Object.keys(value).length > 0;
}

function isInvalidLayerValue(value: unknown): boolean {
    return isRecord(value) && value.parseStatus === "invalid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
