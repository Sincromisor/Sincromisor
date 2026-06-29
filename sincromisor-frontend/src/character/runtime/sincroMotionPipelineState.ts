/**
 * 本番 sincro runtime が observe-only / dry-run 段階の motion pipeline 値を一箇所で保持する。
 *
 * 入力境界は Face / Pose / Hand tracker が返した正規化済み snapshot と、既存の
 * reliability / canonical / temporal / intent / composer の plain object contract に限定する。
 * この module は runtime 内部の現在値 contract であり、replay log 保存用の schemaVersion、
 * parser、旧 log fallback は持たない。外へ保存する場合は motion-debug log の各 slot と parser を使う。
 *
 * observable output は clone 済みの plain object で、caller が返却後に元 snapshot の warning 配列や
 * tuple を変更しても保存済み state へ波及しない。副作用はなく、入力値の検証や VRM への適用、
 * CharacterBehaviorSnapshot / CharacterBehaviorState への接続もこの module の責務ではない。
 * plain object 以外や clone 不能な値を誤って渡した場合は、内部の defensive clone が
 * `DataCloneError` 相当を送出し得る。
 */

import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import { cloneSincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshotClone";
import {
    cloneFaceMotionSnapshot,
    createDefaultBehaviorFaceMotionSnapshot,
} from "../behavior/characterBehaviorSnapshots";
import type { CanonicalUpperBodyState } from "../canonical/canonicalUpperBodyState";
import type { MotionIntentState } from "../motionIntent/motionIntentState";
import { cloneMotionIntentState } from "../motionIntent/motionIntentState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type { TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";
import type { SincroVrmPoseComposerDryRunResult } from "./sincroVrmPoseComposerDryRun";

/**
 * Tracker から本番 motion pipeline へ入る正規化済み入力 snapshot。
 *
 * `face` と `pose` は既存本番経路でも必須の低次元 snapshot で、`hand` は Hand tracker が
 * 起動している frame だけ付く optional slot とする。MediaPipe raw result、DOM、MediaStream、
 * VideoFrame、THREE instance は入力境界外であり、ここに載せない。
 */
export type SincroMotionPipelineInputSnapshot = {
    face: SincroFaceMotionSnapshot;
    pose: SincroPoseMotionSnapshot;
    hand?: SincroHandMotionSnapshot;
};

/**
 * 本番 sincro runtime の低次元 motion pipeline 現在値。
 *
 * `face` / `pose` / `hand` は tracker 入力、`reliability` / `canonical` / `temporal` / `intent`
 * は motion-debug で整備済みの JSON 保存可能 contract、`composerDryRun` は production dry-run の
 * status 付き result contract を表す。`status !== "available"` では result を持たないため、
 * Debug Console や recorder は stale final pose を現在 frame として扱わない。`updatedAtMs` は caller
 * が選ぶ runtime clock の時刻で、module 内では `performance.now()` を読まない。
 */
export type SincroMotionPipelineState = SincroMotionPipelineInputSnapshot & {
    reliability?: ReliabilityMap;
    canonical?: CanonicalUpperBodyState;
    temporal?: TemporalUpperBodyState;
    intent?: MotionIntentState;
    composerDryRun?: SincroVrmPoseComposerDryRunResult;
    updatedAtMs: number;
};

/**
 * 空の本番 sincro motion pipeline state を作る。
 *
 * 返す値は face / pose の lost 相当 default と `updatedAtMs: 0` だけを持ち、Hand tracker や
 * reliability 以降の estimator が未起動であることを optional slot の欠損として表す。
 * 入力を取らないため失敗条件と副作用はない。schemaVersion や parser 用 default は生成しない。
 */
export function createDefaultSincroMotionPipelineState(): SincroMotionPipelineState {
    return {
        face: createDefaultBehaviorFaceMotionSnapshot(),
        pose: cloneSincroPoseMotionSnapshot(DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT),
        updatedAtMs: 0,
    };
}

/**
 * 本番 sincro motion pipeline state を後続変更から独立した snapshot として複製する。
 *
 * 既存 clone helper がある Face / Pose / Hand / MotionIntent はそれを使い、helper が無い
 * reliability / canonical / temporal / composer dry-run は structured clone で配列と tuple の
 * 参照を切る。入力値の shape 検証、schemaVersion 変換、VRM 適用、CharacterBehaviorSnapshot への
 * 合流は行わない。clone 不能な runtime object が contract 外から渡った場合は例外が送出される。
 */
export function cloneSincroMotionPipelineState(
    state: SincroMotionPipelineState,
): SincroMotionPipelineState {
    return {
        face: clonePipelineFaceMotionSnapshot(state.face),
        pose: cloneSincroPoseMotionSnapshot(state.pose),
        hand: state.hand === undefined ? undefined : cloneSincroHandMotionSnapshot(state.hand),
        reliability:
            state.reliability === undefined ? undefined : structuredClone(state.reliability),
        canonical: state.canonical === undefined ? undefined : structuredClone(state.canonical),
        temporal: state.temporal === undefined ? undefined : structuredClone(state.temporal),
        intent: state.intent === undefined ? undefined : cloneMotionIntentState(state.intent),
        composerDryRun:
            state.composerDryRun === undefined ? undefined : structuredClone(state.composerDryRun),
        updatedAtMs: state.updatedAtMs,
    };
}

function clonePipelineFaceMotionSnapshot(
    snapshot: SincroFaceMotionSnapshot,
): SincroFaceMotionSnapshot {
    const cloned = cloneFaceMotionSnapshot(snapshot);
    const matrix = snapshot.headPose.matrix;
    return {
        ...cloned,
        headPose: {
            ...cloned.headPose,
            matrix: matrix === undefined ? undefined : [...matrix],
        },
    };
}
