import type {
    SincroGestureMotionSnapshot,
    SincroGestureSideSnapshot,
} from "../../features/gaze/gestureTracking/sincroGestureMotionSnapshot";
import type {
    SincroHandMotionSnapshot,
    SincroHandSideSnapshot,
} from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { GestureIntentObservation } from "../motionIntent/motionIntentEstimator";
import type { FullNormalizedPoseApplicationMode } from "../retargeting/sincroPoseRetargeter";
import type { SincroMotionPipelineState } from "./sincroMotionPipelineState";
import type { SincroVrmPoseComposerDryRunStatus } from "./sincroVrmPoseComposerDryRun";

// reason: structure-threshold-exception 既存の observe-only summary/types module が行数上限を超えているため。本タスクでは Gesture 入力と summary 契約の追加だけに留める。

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
 * Hand tracker の常時表示用 side summary。
 *
 * Hand snapshot 本体は palm / finger feature を持つが、Debug Console の常時表示では左右ごとの検出状態、
 * source、ROI warning、openness、confidence だけへ圧縮する。MediaPipe raw landmark、crop object、
 * full-frame wrist 座標はこの summary に載せない。
 */
export type SincroMotionObserveOnlyHandSideSummary = {
    detected: boolean;
    source: SincroHandSideSnapshot["source"];
    roiWarning?: string;
    openness: SincroHandSideSnapshot["features"]["openness"];
    confidence: number;
};

/**
 * production Debug Console に出す Hand snapshot の低次元 summary。
 *
 * availability と左右 side summary だけを持ち、Gesture / finger bone 適用や腕 IK target の入力にはしない。
 * Hand wrist は reliability / finger feature の材料であり、腕 target は Pose snapshot 側を正本に保つ。
 */
export type SincroMotionObserveOnlyHandSummary = {
    status: SincroMotionObserveOnlyAvailability;
    mediaTimeMs?: number;
    reason?: string;
    trackingEnabled: boolean;
    detected: boolean;
    left: SincroMotionObserveOnlyHandSideSummary;
    right: SincroMotionObserveOnlyHandSideSummary;
    warnings: readonly string[];
};

export type SincroMotionObserveOnlyGestureSideSummary = {
    label: string;
    confidence: number;
    source: SincroGestureSideSnapshot["source"];
    warnings: readonly string[];
};

/**
 * production Debug Console に出す Gesture optional pass の低次元 summary。
 *
 * GestureRecognizer snapshot 本体や MediaPipe category list は常時表示へ流さず、availability と左右の
 * top label / confidence / source / warning だけへ圧縮する。raw label は MotionIntent の説明入力であり、
 * semantic intent 名や reliability component へはここで変換しない。
 */
export type SincroMotionObserveOnlyGestureSummary = {
    status: SincroMotionObserveOnlyAvailability;
    mediaTimeMs?: number;
    reason?: string;
    trackingEnabled: boolean;
    inferenceFps: number;
    left?: SincroMotionObserveOnlyGestureSideSummary;
    right?: SincroMotionObserveOnlyGestureSideSummary;
    warnings: readonly string[];
};

/**
 * production VrmPoseComposer dry-run の Debug Console summary。
 *
 * `status` は service result contract と同じ 4 状態をそのまま表示する。`result` 本体は大きいため
 * 常時表示では warning、suppressed layer、clamped bone の短い一覧だけに圧縮し、finalPose は
 * `SincroMotionPipelineState.composerDryRun.result` 側の inspection surface に残す。
 */
export type SincroMotionComposerDryRunSummary = {
    status: SincroVrmPoseComposerDryRunStatus;
    warnings: readonly string[];
    suppressedLayers: readonly string[];
    clampedBones: readonly string[];
    fullNormalizedPoseApplication?: {
        mode: FullNormalizedPoseApplicationMode;
        applied: boolean;
        rollbackReason?: string;
    };
};

/**
 * production Debug Console に出す observe-only pipeline の最新 summary。
 *
 * 各 stage が `available` / `not_computed` / `invalid_input` のどれかを個別に示すため、
 * Face-only、pose-only、invalid timing を JSON dump なしで切り分けられる。composer dry-run は
 * VRM 適用を伴わない production manager 側の観測値として同じ summary surface に載せる。
 */
export type SincroMotionObserveOnlySummary = {
    reliability: SincroMotionObserveOnlyStageSummary;
    canonical: SincroMotionObserveOnlyStageSummary;
    temporal: SincroMotionObserveOnlyStageSummary;
    intent: SincroMotionObserveOnlyStageSummary;
    hand: SincroMotionObserveOnlyHandSummary;
    gesture: SincroMotionObserveOnlyGestureSummary;
    composerDryRun: SincroMotionComposerDryRunSummary;
    updatedAtMs: number;
};

/**
 * observe-only 更新の caller 指定境界。
 *
 * `mediaTimeMs` は video frame clock 由来を優先し、欠損時だけ wrapper が `receivedAtMs` に
 * callback 受信時刻を入れる。estimator 内部で現在時刻を読ませないため、両方が非 finite の入力は
 * `invalid_input` として保存済み snapshot だけ更新し、downstream estimator は進めない。
 *
 * `cameraQuality` は production controller が Pose callback で生成した最新 score だけを渡す optional
 * 入力である。Face-only / Hand-only / source none 相当では `undefined` のままにし、ReliabilityMap の
 * `camera_quality_missing` fallback を使う。MediaStreamTrack や raw device id / label はこの境界に入れない。
 *
 * `gesture` は Gesture snapshot を MotionIntentEstimator 用に正規化した optional observation だけを受ける。
 * MediaPipe raw category list や handedness object はここへ渡さず、ReliabilityMap.gesture も本境界では
 * placeholder のまま維持する。
 */
export type SincroMotionObserveOnlyPipelineInput = {
    mediaTimeMs?: number;
    receivedAtMs?: number;
    video?: {
        width: number;
        height: number;
    };
    hand?: SincroHandMotionSnapshot;
    gesture?: GestureIntentObservation;
    cameraQuality?: CameraQualityScore;
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

/**
 * observe-only pipeline が downstream estimator へ渡す時刻解決結果。
 *
 * `mediaTimeMs` は Reliability / Canonical / Temporal / Intent の timestamp に使う video-frame 基準の時刻、
 * `updatedAtMs` は Debug Console の最新更新表示に使う callback 受信側の runtime 時刻である。
 * Tracker timing が有効なら両者は分離でき、`mediaTimeMs` 欠損時だけ `receivedAtMs` を両方へ fallback する。
 *
 * `status: "invalid_input"` は `mediaTimeMs` と fallback 用 `receivedAtMs` の両方が非 finite / 欠損の失敗条件を表す。
 * この状態では snapshot 保存と summary 更新だけを許可し、Temporal / MotionIntent などの stateful downstream
 * estimator は進めない。caller は例外ではなく Debug Console の `invalid_input` summary と reason を観測点にする。
 */
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

export function summarizeObserveOnlyHand(
    snapshot: SincroMotionPipelineState["hand"],
    overrideStatus: SincroMotionObserveOnlyAvailability | undefined,
    reason: string,
): SincroMotionObserveOnlyHandSummary {
    if (overrideStatus === "invalid_input") {
        return createNotComputedHandSummary("invalid_input", reason);
    }
    if (snapshot === undefined) {
        return createNotComputedHandSummary("not_computed", reason);
    }
    return {
        status: "available",
        mediaTimeMs: snapshot.lastUpdatedAtMs,
        reason: snapshot.fallbackReason,
        trackingEnabled: snapshot.trackingEnabled,
        detected: snapshot.detected,
        left: summarizeObserveOnlyHandSide(snapshot.leftHand),
        right: summarizeObserveOnlyHandSide(snapshot.rightHand),
        warnings: [
            ...new Set([...snapshot.leftHand.warnings, ...snapshot.rightHand.warnings]),
        ].slice(0, 6),
    };
}

export function summarizeObserveOnlyGesture(
    snapshot: SincroGestureMotionSnapshot | undefined,
    overrideStatus: SincroMotionObserveOnlyAvailability | undefined,
    reason: string,
): SincroMotionObserveOnlyGestureSummary {
    if (overrideStatus === "invalid_input") {
        return createNotComputedGestureSummary("invalid_input", reason);
    }
    if (snapshot === undefined) {
        return createNotComputedGestureSummary("not_computed", reason);
    }
    return {
        status: "available",
        mediaTimeMs: snapshot.lastUpdatedAtMs,
        reason: snapshot.fallbackReason,
        trackingEnabled: snapshot.trackingEnabled,
        inferenceFps: snapshot.inferenceFps,
        left: summarizeObserveOnlyGestureSide(snapshot.left),
        right: summarizeObserveOnlyGestureSide(snapshot.right),
        warnings: [...snapshot.warnings].slice(0, 6),
    };
}

/**
 * dry-run result contract を Debug Console 常時表示用の小さい summary へ圧縮する。
 *
 * `status !== "available"` では result 詳細を読まず、warning だけを表示する。available result でも
 * finalPose 全体は返さず、suppressed layer / clamped bone の先頭だけを診断入口として返す。
 */
export function summarizeComposerDryRun(
    result: SincroMotionPipelineState["composerDryRun"],
): SincroMotionComposerDryRunSummary {
    if (result === undefined) {
        return {
            status: "not_ready",
            warnings: ["composer_dry_run_not_started"],
            suppressedLayers: [],
            clampedBones: [],
            fullNormalizedPoseApplication: undefined,
        };
    }
    return {
        status: result.status,
        warnings: [...result.warnings].slice(0, 6),
        suppressedLayers:
            result.result === undefined
                ? []
                : result.result.suppressedLayers
                      .map((layer) => `${layer.id}:${layer.kind}:${layer.bone}:${layer.reason}`)
                      .slice(0, 6),
        clampedBones:
            result.result === undefined
                ? []
                : result.result.clampedBones
                      .map((bone) => `${bone.bone}:${bone.reason}`)
                      .slice(0, 6),
        fullNormalizedPoseApplication:
            result.fullNormalizedPoseApplication === undefined
                ? undefined
                : {
                      mode: result.fullNormalizedPoseApplication.mode,
                      applied: result.fullNormalizedPoseApplication.applied,
                      rollbackReason: result.fullNormalizedPoseApplication.rollbackReason,
                  },
    };
}

function createNotComputedHandSummary(
    status: SincroMotionObserveOnlyAvailability,
    reason: string,
): SincroMotionObserveOnlyHandSummary {
    return {
        status,
        reason,
        trackingEnabled: false,
        detected: false,
        left: {
            detected: false,
            source: "lost",
            openness: "unknown",
            confidence: 0,
        },
        right: {
            detected: false,
            source: "lost",
            openness: "unknown",
            confidence: 0,
        },
        warnings: [],
    };
}

function createNotComputedGestureSummary(
    status: SincroMotionObserveOnlyAvailability,
    reason: string,
): SincroMotionObserveOnlyGestureSummary {
    return {
        status,
        reason,
        trackingEnabled: false,
        inferenceFps: 0,
        warnings: [],
    };
}

function summarizeObserveOnlyGestureSide(
    side: SincroGestureSideSnapshot | undefined,
): SincroMotionObserveOnlyGestureSideSummary | undefined {
    if (side === undefined) {
        return undefined;
    }
    return {
        label: side.label,
        confidence: side.confidence,
        source: side.source,
        warnings: [...side.warnings].slice(0, 4),
    };
}

function summarizeObserveOnlyHandSide(
    side: SincroHandSideSnapshot,
): SincroMotionObserveOnlyHandSideSummary {
    return {
        detected: side.detected,
        source: side.source,
        roiWarning: resolveHandRoiWarning(side),
        openness: side.features.openness,
        confidence: side.confidence,
    };
}

function resolveHandRoiWarning(side: SincroHandSideSnapshot): string | undefined {
    const roiWarning = side.roi?.warnings[0];
    if (roiWarning !== undefined) {
        return roiWarning;
    }
    return side.warnings.find(
        (warning) =>
            warning === "roi_missing" ||
            warning === "roi_inconsistent" ||
            warning === "pose_stale_for_roi",
    );
}

function isFiniteNonNegative(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value >= 0;
}
