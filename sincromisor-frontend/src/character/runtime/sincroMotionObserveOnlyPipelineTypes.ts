import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroMotionPipelineState } from "./sincroMotionPipelineState";

/**
 * Debug Console に出す observe-only stage の計算状態。
 *
 * `not_computed` は Pose 未到着や reset 直後の通常状態、`invalid_input` は時刻基準など caller 境界の
 * 入力不正を表す。estimator が返す信頼度低下や tracking lost は `available` state 内の warning として扱う。
 */
export type SincroMotionObserveOnlyAvailability = "available" | "not_computed" | "invalid_input";

/**
 * 巨大な pipeline state を常時描画しないための stage 単位 summary。
 *
 * warning は診断の入口として短く保持し、詳細な ReliabilityMap / Canonical / Temporal / Intent の値は
 * `SincroMotionPipelineState` や motion-debug 側の inspection surface で確認する。
 */
export type SincroMotionObserveOnlyStageSummary = {
    status: SincroMotionObserveOnlyAvailability;
    mediaTimeMs?: number;
    reason?: string;
    warnings: readonly string[];
};

/**
 * production Debug Console に出す observe-only pipeline の最新 summary。
 *
 * 各 stage が `available` / `not_computed` / `invalid_input` のどれかを個別に示すため、
 * Face-only、pose-only、invalid timing を JSON dump なしで切り分けられる。
 */
export type SincroMotionObserveOnlySummary = {
    reliability: SincroMotionObserveOnlyStageSummary;
    canonical: SincroMotionObserveOnlyStageSummary;
    temporal: SincroMotionObserveOnlyStageSummary;
    intent: SincroMotionObserveOnlyStageSummary;
    updatedAtMs: number;
};

/**
 * observe-only 更新の caller 指定境界。
 *
 * `mediaTimeMs` は video frame clock 由来を優先し、欠損時だけ wrapper が `receivedAtMs` に
 * callback 受信時刻を入れる。estimator 内部で現在時刻を読ませないため、両方が非 finite の入力は
 * `invalid_input` として保存済み snapshot だけ更新し、downstream estimator は進めない。
 */
export type SincroMotionObserveOnlyPipelineInput = {
    mediaTimeMs?: number;
    receivedAtMs?: number;
    video?: {
        width: number;
        height: number;
    };
    hand?: SincroHandMotionSnapshot;
};

/**
 * callback 1 件に対する observe-only 更新結果。
 *
 * `state` は clone 済みの現在値、`summary` は Debug Console が常時表示するための小さい状態要約である。
 * 巨大な ReliabilityMap / Canonical / Temporal / Intent JSON はここから常時描画しない。
 */
export type SincroMotionObserveOnlyPipelineUpdateResult = {
    state: SincroMotionPipelineState;
    summary: SincroMotionObserveOnlySummary;
};

export type SincroMotionObserveOnlyTiming = {
    status: SincroMotionObserveOnlyAvailability;
    mediaTimeMs: number;
    updatedAtMs: number;
    reason?: string;
};

/**
 * caller が渡した video frame timing と callback 受信時刻を observe-only 用の時刻基準へ正規化する。
 *
 * `mediaTimeMs` を優先し、欠損時だけ `receivedAtMs` を fallback とする。両方が無効な場合は
 * downstream estimator を進めないための `invalid_input` を返し、例外は送出しない。
 */
export function resolveObserveOnlyTiming(
    input: SincroMotionObserveOnlyPipelineInput,
): SincroMotionObserveOnlyTiming {
    if (isFiniteNonNegative(input.mediaTimeMs)) {
        return {
            status: "available",
            mediaTimeMs: input.mediaTimeMs,
            updatedAtMs: isFiniteNonNegative(input.receivedAtMs)
                ? input.receivedAtMs
                : input.mediaTimeMs,
        };
    }
    if (isFiniteNonNegative(input.receivedAtMs)) {
        return {
            status: "available",
            mediaTimeMs: input.receivedAtMs,
            updatedAtMs: input.receivedAtMs,
        };
    }
    return {
        status: "invalid_input",
        mediaTimeMs: 0,
        updatedAtMs: 0,
        reason: "media_time_missing",
    };
}

/**
 * ReliabilityMap の border component 用 video size を有限の正数へ正規化する。
 *
 * DOM や video element は runtime service へ持ち込まず、欠損時は pose-only fallback を継続するため
 * 1x1 の placeholder に落とす。表示姿勢への副作用はない。
 */
export function normalizeObserveOnlyVideoSize(
    video: SincroMotionObserveOnlyPipelineInput["video"],
): { width: number; height: number } {
    if (video && Number.isFinite(video.width) && Number.isFinite(video.height)) {
        return {
            width: Math.max(1, video.width),
            height: Math.max(1, video.height),
        };
    }
    return { width: 1, height: 1 };
}

/**
 * pipeline state の有無と invalid override から Debug Console 用 stage summary を作る。
 *
 * warnings は常時表示で読み切れる数に切り詰め、詳細調査は保存済み pipeline state 側へ委ねる。
 */
export function summarizeObserveOnlyStage(
    state:
        | SincroMotionPipelineState["reliability"]
        | SincroMotionPipelineState["canonical"]
        | SincroMotionPipelineState["temporal"]
        | SincroMotionPipelineState["intent"],
    mediaTimeMs: number | undefined,
    overrideStatus: SincroMotionObserveOnlyAvailability | undefined,
    notComputedReason: string,
    warnings: readonly string[] | undefined,
): SincroMotionObserveOnlyStageSummary {
    if (overrideStatus === "invalid_input") {
        return { status: "invalid_input", reason: notComputedReason, warnings: [] };
    }
    if (state === undefined) {
        return { status: "not_computed", reason: notComputedReason, warnings: [] };
    }
    return {
        status: "available",
        mediaTimeMs,
        warnings: [...(warnings ?? [])].slice(0, 6),
    };
}

function isFiniteNonNegative(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value >= 0;
}
