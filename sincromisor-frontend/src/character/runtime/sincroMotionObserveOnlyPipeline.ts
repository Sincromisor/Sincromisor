/**
 * 本番 sincro runtime で motion pipeline の低次元 state だけを更新する observe-only service。
 *
 * tracker callback が渡す Face / Pose / Hand / Gesture snapshot と明示された `mediaTimeMs` を入力境界にし、
 * optional `CameraQualityScore` と Gesture observation、ReliabilityMap、CanonicalUpperBodyState、TemporalUpperBodyState、
 * MotionIntentState を `SincroMotionPipelineState` へ保存する。VRM bone、expression、root position、
 * controller 呼び出し順序、composer dry-run はこの service の非対象であり、失敗時も既存表示姿勢へ
 * fallback させない。
 */
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroGestureMotionSnapshot } from "../../features/gaze/gestureTracking/sincroGestureMotionSnapshot";
import {
    cloneSincroHandMotionSnapshot,
    type SincroHandMotionSnapshot,
} from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshotClone";
import { createPoseReliabilityMap } from "../reliability/poseReliabilityEstimator";
import { computeSincroCanonicalMotion, SincroMotionComputation } from "./sincroMotionComputation";
import {
    normalizeObserveOnlyVideoSize,
    resolveObserveOnlyTiming,
    type SincroMotionObserveOnlyAvailability,
    type SincroMotionObserveOnlyPipelineInput,
    type SincroMotionObserveOnlyPipelineUpdateResult,
    type SincroMotionObserveOnlySummary,
    summarizeComposerDryRun,
    summarizeObserveOnlyGesture,
    summarizeObserveOnlyHand,
    summarizeObserveOnlyStage,
} from "./sincroMotionObserveOnlyPipelineTypes";
import {
    clonePipelineFaceMotionSnapshot,
    cloneSincroMotionPipelineState,
    createDefaultSincroMotionPipelineState,
    type SincroMotionPipelineState,
} from "./sincroMotionPipelineState";

// reason: structure-threshold-exception 観測の蓄積・公開要約と既存の関数窓口を同じ場所に保つ。状態付き計算はsincroMotionComputationへ分離する。

export type {
    SincroMotionComposerDryRunSummary,
    SincroMotionObserveOnlyAvailability,
    SincroMotionObserveOnlyGestureSideSummary,
    SincroMotionObserveOnlyGestureSummary,
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
 * 顔・姿勢・手・ジェスチャーの観測から、信頼性・共通表現・時系列・意図を更新する。
 * 入力観測と公開結果は複製して参照を分離し、内部では所有済みの観測と計算結果を再利用する。
 *
 * stateful estimator は mode 切替、camera refresh、tracking stop で `reset()` される前提で保持する。
 * `updatePose()` は optional `cameraQuality` を同一 Pose frame の reliability へ反映して temporal / intent
 * まで進める。`updateFace()` / `updateHand()` は最新 snapshot を保存し、既存 Pose があれば
 * caller が渡す最新 camera quality とともに reliability / canonical を観測用に再計算する。optional pass 単独では
 * VRM も stateful temporal memory も進めないため、callback 順が入れ替わっても controller の姿勢適用順序は変わらない。
 * `updateGesture()` は Gesture optional pass の cadence が Pose と異なるため latest observation だけを保持し、
 * 次の Pose / reliability 更新で同じ `ReliabilityMap.gesture` を読ませる。
 */
export class SincroMotionObserveOnlyPipeline {
    private state = createDefaultSincroMotionPipelineState();
    private readonly computation = new SincroMotionComputation();
    private previousPose: PoseReliabilityPrevious | undefined;
    private hasFace = false;
    private hasPose = false;
    private gestureSummarySource?: SincroGestureMotionSnapshot;

    /** 内部状態から独立したスナップショットを返し、利用側による配列・行列の変更を隔離する。 */
    getState(): SincroMotionPipelineState {
        return cloneSincroMotionPipelineState(this.state);
    }

    /** 診断表示に必要な小さい要約だけを返す。状態本体の複製は必要な取得時に限定する。 */
    getSummary(): SincroMotionObserveOnlySummary {
        return this.createSummary();
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
        this.gestureSummarySource = undefined;
        this.computation.reset();
    }

    /** 顔と任意の手・ジェスチャーを複製して取り込み、Poseがあれば信頼性と共通表現を更新する。
     * 顔だけの更新では時系列・意図の履歴を進めず、無効時刻なら観測の保存と診断だけを行う。 */
    updateFace(
        snapshot: SincroFaceMotionSnapshot,
        input: SincroMotionObserveOnlyPipelineInput,
    ): SincroMotionObserveOnlyPipelineUpdateResult {
        const timing = resolveObserveOnlyTiming(input);
        this.hasFace = true;
        this.state = {
            ...this.state,
            face: clonePipelineFaceMotionSnapshot(snapshot),
            hand:
                input.hand === undefined
                    ? this.state.hand
                    : cloneSincroHandMotionSnapshot(input.hand),
            gesture:
                input.gesture === undefined ? this.state.gesture : structuredClone(input.gesture),
            updatedAtMs: timing.updatedAtMs,
        };
        if (timing.status === "invalid_input") {
            return this.createResult("invalid_input", timing.reason);
        }
        if (this.hasPose) {
            this.updateDownstream({
                mediaTimeMs: timing.mediaTimeMs,
                video: normalizeObserveOnlyVideoSize(input.video),
                cameraQuality: input.cameraQuality,
                updateStatefulEstimators: false,
            });
        }
        return this.createResult();
    }

    /** 姿勢と任意の手・ジェスチャーを複製して取り込み、信頼性→共通表現→時系列→意図を更新する。
     * 顔・手の欠損は低信頼度として扱い、無効時刻なら観測だけを保存する。VRMへの適用は呼び出し元が担う。 */
    updatePose(
        snapshot: SincroPoseMotionSnapshot,
        input: SincroMotionObserveOnlyPipelineInput,
    ): SincroMotionObserveOnlyPipelineUpdateResult {
        const timing = resolveObserveOnlyTiming(input);
        this.hasPose = true;
        this.state = {
            ...this.state,
            pose: cloneSincroPoseMotionSnapshot(snapshot),
            hand:
                input.hand === undefined
                    ? this.state.hand
                    : cloneSincroHandMotionSnapshot(input.hand),
            gesture:
                input.gesture === undefined ? this.state.gesture : structuredClone(input.gesture),
            updatedAtMs: timing.updatedAtMs,
        };
        if (timing.status === "invalid_input") {
            return this.createResult("invalid_input", timing.reason);
        }
        this.updateDownstream({
            mediaTimeMs: timing.mediaTimeMs,
            video: normalizeObserveOnlyVideoSize(input.video),
            cameraQuality: input.cameraQuality,
            updateStatefulEstimators: true,
        });
        return this.createResult();
    }

    /** 手と任意のジェスチャーを複製して取り込み、Poseがあれば信頼性と共通表現を更新する。
     * 手は指の特徴と信頼性の材料であり、腕IKの目標や時系列・意図の履歴を単独では更新しない。 */
    updateHand(
        snapshot: SincroHandMotionSnapshot,
        input: SincroMotionObserveOnlyPipelineInput,
    ): SincroMotionObserveOnlyPipelineUpdateResult {
        const timing = resolveObserveOnlyTiming(input);
        this.state = {
            ...this.state,
            hand: cloneSincroHandMotionSnapshot(snapshot),
            gesture:
                input.gesture === undefined ? this.state.gesture : structuredClone(input.gesture),
            updatedAtMs: timing.updatedAtMs,
        };
        if (timing.status === "invalid_input") {
            return this.createResult("invalid_input", timing.reason);
        }
        if (this.hasPose) {
            this.updateDownstream({
                mediaTimeMs: timing.mediaTimeMs,
                video: normalizeObserveOnlyVideoSize(input.video),
                cameraQuality: input.cameraQuality,
                updateStatefulEstimators: false,
            });
        }
        return this.createResult();
    }

    /** 表示用のジェスチャーと、呼び出し元が正規化した意図入力を複製して保持する。
     * この観測だけでは推定を進めず、次のPose・信頼性更新で参照する。 */
    updateGesture(
        snapshot: SincroGestureMotionSnapshot,
        input: SincroMotionObserveOnlyPipelineInput,
    ): SincroMotionObserveOnlyPipelineUpdateResult {
        const timing = resolveObserveOnlyTiming(input);
        this.gestureSummarySource = structuredClone(snapshot);
        this.state = {
            ...this.state,
            gesture: input.gesture === undefined ? undefined : structuredClone(input.gesture),
            updatedAtMs: timing.updatedAtMs,
        };
        return timing.status === "invalid_input"
            ? this.createResult("invalid_input", timing.reason)
            : this.createResult();
    }

    /** 観測ごとの信頼性と共通表現を更新し、Pose到着時だけ共通推定の状態を進める。 */
    private updateDownstream(input: {
        mediaTimeMs: number;
        video: { width: number; height: number };
        cameraQuality: SincroMotionObserveOnlyPipelineInput["cameraQuality"];
        updateStatefulEstimators: boolean;
    }): void {
        const reliability = createPoseReliabilityMap({
            pose: this.state.pose,
            hand: this.state.hand,
            face: this.hasFace ? this.state.face : undefined,
            gesture: this.state.gesture,
            previous: this.previousPose,
            mediaTimeMs: input.mediaTimeMs,
            video: input.video,
            cameraQuality: input.cameraQuality,
        });
        const canonical = computeSincroCanonicalMotion({
            pose: this.state.pose,
            face: this.hasFace ? this.state.face : undefined,
            previous: this.state.canonical,
            mediaTimeMs: input.mediaTimeMs,
            reliability,
        });
        this.state = {
            ...this.state,
            reliability,
            canonical,
        };

        if (!input.updateStatefulEstimators) {
            return;
        }

        const { temporal, intent } = this.computation.update({
            canonical,
            reliability,
            hand: this.state.hand,
            gesture: this.state.gesture,
            mediaTimeMs: input.mediaTimeMs,
        });
        this.previousPose = {
            // 取り込み時に複製したPoseは内部で変更しないため、前回値にも同じ参照を使う。
            pose: this.state.pose,
            mediaTimeMs: input.mediaTimeMs,
            reliability,
        };
        this.state = {
            ...this.state,
            temporal,
            intent,
        };
    }

    private createResult(
        overrideStatus?: SincroMotionObserveOnlyAvailability,
        reason?: string,
    ): SincroMotionObserveOnlyPipelineUpdateResult {
        return {
            state: this.getState(),
            summary: this.createSummary(overrideStatus, reason),
        };
    }

    /** 要約に必要な値と警告配列だけを取り出し、状態全体の複製を避ける。 */
    private createSummary(
        overrideStatus?: SincroMotionObserveOnlyAvailability,
        reason?: string,
    ): SincroMotionObserveOnlySummary {
        const state = this.state;
        return {
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
            gesture: summarizeObserveOnlyGesture(
                this.gestureSummarySource,
                overrideStatus,
                reason ?? "gesture_not_available",
            ),
            composerDryRun: summarizeComposerDryRun(state.composerDryRun),
            updatedAtMs: state.updatedAtMs,
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

/**
 * Gesture callback 用の module-level export。
 *
 * Gesture snapshot は Debug Console 用 summary に圧縮し、MotionIntentEstimator へ渡す値は caller が
 * 正規化済み `GestureIntentObservation` として `input.gesture` に入れたものだけを使う。
 */
export function updateGesture(
    pipeline: SincroMotionObserveOnlyPipeline,
    snapshot: SincroGestureMotionSnapshot,
    input: SincroMotionObserveOnlyPipelineInput,
): SincroMotionObserveOnlyPipelineUpdateResult {
    return pipeline.updateGesture(snapshot, input);
}
