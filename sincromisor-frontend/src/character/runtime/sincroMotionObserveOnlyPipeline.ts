/**
 * 本番 sincro runtime で motion pipeline の低次元 state だけを更新する observe-only service。
 *
 * tracker callback が渡す Face / Pose snapshot と明示された `mediaTimeMs` を入力境界にし、
 * ReliabilityMap、CanonicalUpperBodyState、TemporalUpperBodyState、MotionIntentState を
 * `SincroMotionPipelineState` へ保存する。VRM bone、expression、root position、controller 呼び出し順序、
 * composer dry-run はこの service の非対象であり、失敗時も既存表示姿勢へ fallback させない。
 */
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { createCanonicalUpperBodyState } from "../canonical/canonicalArmFeatureExtractor";
import { estimateCanonicalTorsoFrame } from "../canonical/canonicalTorsoFrameEstimator";
import { MotionIntentEstimator } from "../motionIntent/motionIntentEstimator";
import { createPoseReliabilityMap } from "../reliability/poseReliabilityEstimator";
import { TemporalStateEstimator } from "../temporal/temporalStateEstimator";
import {
    normalizeObserveOnlyVideoSize,
    resolveObserveOnlyTiming,
    type SincroMotionObserveOnlyAvailability,
    type SincroMotionObserveOnlyPipelineInput,
    type SincroMotionObserveOnlyPipelineUpdateResult,
    type SincroMotionObserveOnlySummary,
    summarizeObserveOnlyHand,
    summarizeObserveOnlyStage,
} from "./sincroMotionObserveOnlyPipelineTypes";
import {
    cloneSincroMotionPipelineState,
    createDefaultSincroMotionPipelineState,
    type SincroMotionPipelineState,
} from "./sincroMotionPipelineState";

export type {
    SincroMotionObserveOnlyAvailability,
    SincroMotionObserveOnlyHandSideSummary,
    SincroMotionObserveOnlyHandSummary,
    SincroMotionObserveOnlyPipelineInput,
    SincroMotionObserveOnlyPipelineUpdateResult,
    SincroMotionObserveOnlyStageSummary,
    SincroMotionObserveOnlySummary,
} from "./sincroMotionObserveOnlyPipelineTypes";

type PoseReliabilityPrevious = NonNullable<
    Parameters<typeof createPoseReliabilityMap>[0]["previous"]
>;

/**
 * Face / Pose tracker callback から本番 observe-only state を更新する stateful service。
 *
 * stateful estimator は mode 切替、camera refresh、tracking stop で `reset()` される前提で保持する。
 * `updatePose()` は temporal / intent まで進め、`updateFace()` は最新 Face を保存し、既存 Pose があれば
 * head reliability / canonical yaw を観測用に再計算する。Face callback 単独では VRM も stateful
 * temporal memory も進めないため、Face/Pose callback 順が入れ替わっても controller の姿勢適用順序は変わらない。
 */
export class SincroMotionObserveOnlyPipeline {
    private state = createDefaultSincroMotionPipelineState();
    private readonly temporalEstimator = new TemporalStateEstimator();
    private readonly intentEstimator = new MotionIntentEstimator();
    private previousPose: PoseReliabilityPrevious | undefined;
    private hasFace = false;
    private hasPose = false;

    /**
     * 保存済み pipeline state を clone して返す。
     *
     * caller が Debug Console やテストで参照しても内部 estimator memory へ書き戻せないようにする。
     * VRM 適用や CharacterBehaviorSnapshot への合流は行わない。
     */
    getState(): SincroMotionPipelineState {
        return cloneSincroMotionPipelineState(this.state);
    }

    /**
     * Debug Console 用の小さい summary だけを返す。
     *
     * 常時描画面ではこの値を使い、ReliabilityMap / Canonical / Temporal / Intent 本体の大きな JSON は
     * motion-debug など明示 inspection 用 surface に閉じる。
     */
    getSummary(): SincroMotionObserveOnlySummary {
        return this.createResult().summary;
    }

    /**
     * camera source や mode をまたいで残る stateful memory を破棄する。
     *
     * Temporal filter、classification hold、intent hysteresis / cooldown を次の tracking session へ
     * 持ち越さないための lifecycle 境界である。VRM の現在姿勢や retarget runtime snapshot は変更しない。
     */
    reset(): void {
        this.state = createDefaultSincroMotionPipelineState();
        this.previousPose = undefined;
        this.hasFace = false;
        this.hasPose = false;
        this.temporalEstimator.reset();
        this.intentEstimator.reset();
    }

    /**
     * Face callback から latest Face と head reliability / canonical yaw を observe-only 更新する。
     *
     * Pose が未到着の Face-only frame は `not_computed` のまま保存し、stateful temporal / intent memory は
     * Pose callback だけで進める。これにより Face/Pose callback 順の差で腕の temporal state が二重更新されない。
     */
    updateFace(
        snapshot: SincroFaceMotionSnapshot,
        input: SincroMotionObserveOnlyPipelineInput,
    ): SincroMotionObserveOnlyPipelineUpdateResult {
        const timing = resolveObserveOnlyTiming(input);
        this.hasFace = true;
        this.state = cloneSincroMotionPipelineState({
            ...this.state,
            face: snapshot,
            hand: input.hand ?? this.state.hand,
            updatedAtMs: timing.updatedAtMs,
        });
        if (timing.status === "invalid_input") {
            return this.createResult("invalid_input", timing.reason);
        }
        if (this.hasPose) {
            this.updateDownstream({
                mediaTimeMs: timing.mediaTimeMs,
                video: normalizeObserveOnlyVideoSize(input.video),
                updateStatefulEstimators: false,
            });
        }
        return this.createResult();
    }

    /**
     * Pose callback から reliability / canonical / temporal / intent を observe-only 更新する。
     *
     * Face / Hand が未到着の旧 pose-only frame では該当 reliability を placeholder にし、例外ではなく
     * `available` state 内の低信頼度として保存する。VRM pose と controller 呼び出し順序は変更しない。
     */
    updatePose(
        snapshot: SincroPoseMotionSnapshot,
        input: SincroMotionObserveOnlyPipelineInput,
    ): SincroMotionObserveOnlyPipelineUpdateResult {
        const timing = resolveObserveOnlyTiming(input);
        this.hasPose = true;
        this.state = cloneSincroMotionPipelineState({
            ...this.state,
            pose: snapshot,
            hand: input.hand ?? this.state.hand,
            updatedAtMs: timing.updatedAtMs,
        });
        if (timing.status === "invalid_input") {
            return this.createResult("invalid_input", timing.reason);
        }
        this.updateDownstream({
            mediaTimeMs: timing.mediaTimeMs,
            video: normalizeObserveOnlyVideoSize(input.video),
            updateStatefulEstimators: true,
        });
        return this.createResult();
    }

    /**
     * Hand callback から latest Hand snapshot と Debug Console summary だけを更新する。
     *
     * Hand wrist は reliability / finger feature の材料であり、腕 IK target を置き換えない。Pose が既に
     * 到着している場合だけ downstream を再計算し、Temporal / Intent の stateful memory は次の Pose
     * callback まで進めない。Hand 初期化失敗や ROI pause の lost snapshot も例外にせず保存する。
     */
    updateHand(
        snapshot: SincroHandMotionSnapshot,
        input: SincroMotionObserveOnlyPipelineInput,
    ): SincroMotionObserveOnlyPipelineUpdateResult {
        const timing = resolveObserveOnlyTiming(input);
        this.state = cloneSincroMotionPipelineState({
            ...this.state,
            hand: snapshot,
            updatedAtMs: timing.updatedAtMs,
        });
        if (timing.status === "invalid_input") {
            return this.createResult("invalid_input", timing.reason);
        }
        if (this.hasPose) {
            this.updateDownstream({
                mediaTimeMs: timing.mediaTimeMs,
                video: normalizeObserveOnlyVideoSize(input.video),
                updateStatefulEstimators: false,
            });
        }
        return this.createResult();
    }

    private updateDownstream(input: {
        mediaTimeMs: number;
        video: { width: number; height: number };
        updateStatefulEstimators: boolean;
    }): void {
        const reliability = createPoseReliabilityMap({
            pose: this.state.pose,
            hand: this.state.hand,
            face: this.hasFace ? this.state.face : undefined,
            previous: this.previousPose,
            mediaTimeMs: input.mediaTimeMs,
            video: input.video,
        });
        const canonical = createCanonicalUpperBodyState({
            pose: this.state.pose,
            torso: estimateCanonicalTorsoFrame({
                pose: this.state.pose,
                face: this.hasFace ? this.state.face : undefined,
                previous: this.state.canonical,
                mediaTimeMs: input.mediaTimeMs,
            }),
            previous: this.state.canonical,
            mediaTimeMs: input.mediaTimeMs,
            reliability,
        });
        this.state = cloneSincroMotionPipelineState({
            ...this.state,
            reliability,
            canonical,
        });

        if (!input.updateStatefulEstimators) {
            return;
        }

        const temporal = this.temporalEstimator.update({
            canonical,
            reliability,
            mediaTimeMs: input.mediaTimeMs,
        });
        const intent = this.intentEstimator.update({
            temporal,
            reliability,
            hand: this.state.hand,
            mediaTimeMs: input.mediaTimeMs,
        });
        this.previousPose = {
            pose: cloneSincroMotionPipelineState(this.state).pose,
            mediaTimeMs: input.mediaTimeMs,
            reliability,
        };
        this.state = cloneSincroMotionPipelineState({
            ...this.state,
            temporal,
            intent,
        });
    }

    private createResult(
        overrideStatus?: SincroMotionObserveOnlyAvailability,
        reason?: string,
    ): SincroMotionObserveOnlyPipelineUpdateResult {
        const state = this.getState();
        return {
            state,
            summary: {
                reliability: summarizeObserveOnlyStage(
                    state.reliability,
                    state.reliability?.timestamp.mediaTimeMs,
                    overrideStatus,
                    reason ?? (this.hasPose ? "reliability_not_computed" : "pose_not_available"),
                    state.reliability?.warnings,
                ),
                canonical: summarizeObserveOnlyStage(
                    state.canonical,
                    state.canonical?.timestamp.mediaTimeMs,
                    overrideStatus,
                    reason ?? (this.hasPose ? "canonical_not_computed" : "pose_not_available"),
                    state.canonical?.warnings,
                ),
                temporal: summarizeObserveOnlyStage(
                    state.temporal,
                    state.temporal?.timestamp.mediaTimeMs,
                    overrideStatus,
                    reason ?? (this.hasPose ? "temporal_not_computed" : "pose_not_available"),
                    state.temporal?.warnings,
                ),
                intent: summarizeObserveOnlyStage(
                    state.intent,
                    state.intent?.timestamp.mediaTimeMs,
                    overrideStatus,
                    reason ?? (this.hasPose ? "intent_not_computed" : "pose_not_available"),
                    state.intent?.warnings,
                ),
                hand: summarizeObserveOnlyHand(
                    state.hand,
                    overrideStatus,
                    reason ?? "hand_not_available",
                ),
                updatedAtMs: state.updatedAtMs,
            },
        };
    }
}

/**
 * lifecycle owner から estimator memory を明示破棄するための module-level export。
 *
 * class method と同じ処理だが、task / test 側が service 境界の required export を名前で確認できるように
 * 残している。二重 reset は許容し、既存 VRM 姿勢や Debug Console の retarget runtime は変更しない。
 */
export function reset(pipeline: SincroMotionObserveOnlyPipeline): void {
    pipeline.reset();
}

/**
 * Face callback 用の module-level export。
 *
 * latest Face を保存し、既存 Pose がある場合だけ observe-only の reliability / canonical summary を更新する。
 * Face-only frame は `not_computed` として返し、missing Pose や旧 snapshot 互換を例外にしない。
 */
export function updateFace(
    pipeline: SincroMotionObserveOnlyPipeline,
    snapshot: SincroFaceMotionSnapshot,
    input: SincroMotionObserveOnlyPipelineInput,
): SincroMotionObserveOnlyPipelineUpdateResult {
    return pipeline.updateFace(snapshot, input);
}

/**
 * Pose callback 用の module-level export。
 *
 * latest Face がまだ無い旧 pose-only frame でも Face / Hand reliability は placeholder として扱い、
 * `ReliabilityMap` 欠損を理由に throw しない。VRM 適用は行わず、結果は `SincroMotionPipelineState` にだけ保存する。
 */
export function updatePose(
    pipeline: SincroMotionObserveOnlyPipeline,
    snapshot: SincroPoseMotionSnapshot,
    input: SincroMotionObserveOnlyPipelineInput,
): SincroMotionObserveOnlyPipelineUpdateResult {
    return pipeline.updatePose(snapshot, input);
}

/**
 * Hand callback 用の module-level export。
 *
 * latest Hand snapshot を observe-only state と Debug Console summary に保存する。Hand wrist は腕 IK
 * target の正本にせず、Pose snapshot の wrist target と既存 retarget 経路を変更しない。
 */
export function updateHand(
    pipeline: SincroMotionObserveOnlyPipeline,
    snapshot: SincroHandMotionSnapshot,
    input: SincroMotionObserveOnlyPipelineInput,
): SincroMotionObserveOnlyPipelineUpdateResult {
    return pipeline.updateHand(snapshot, input);
}
