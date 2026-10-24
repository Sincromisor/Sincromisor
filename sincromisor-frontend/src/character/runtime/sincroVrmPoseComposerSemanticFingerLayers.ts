import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfileTypes";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import {
    type FingerCurlObservation,
    observeFingerCurl,
} from "../motionIntent/fingerCurlObservation";
import { createFingerCurlPoseLayers } from "../motionIntent/fingerCurlPoseLayer";
import {
    createDefaultMotionIntentState,
    parseMotionIntentState,
} from "../motionIntent/motionIntentState";
import { createSemanticMotionPoseLayer } from "../motionIntent/semanticMotionPoseLayer";
import type { TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";
import type { VrmPoseLayer } from "../vrmPose/vrmPoseTypes";

/**
 * 本番の姿勢合成へ意味に基づく動作・指の層を追加するためのスナップショット入力。
 *
 * `intent` は解析時に検証するため `unknown` のまま受け、失敗時は警告を残し、指の保持期限だけは評価する。
 * `hand` は低次元 `SincroHandMotionSnapshot` に限定し、Gesture RecognizerやMediaPipeの未加工の結果、
 * VRM Object3D、元のボーンノードはこの境界へ入れない。
 */
export type SincroVrmPoseComposerSemanticFingerInput = {
    /** 管理側でHandの観測時計へ写した時刻。指側で独自採時しない。 */
    mediaTimeMs?: number;
    /** Handの実観測時刻。同じ観測の再描画では更新しない。 */
    observedAtMs?: number;
    /** Pose時計で評価する意図と腕の新鮮さ。Hand時計とは直接減算しない。 */
    poseMediaTimeMs?: number;
    temporal?: TemporalUpperBodyState;
    trackingEnabled?: boolean;
    intent?: unknown;
    hand?: SincroHandMotionSnapshot;
};

/**
 * 合成サービスがフレーム間で指を短時間保持するための状態。
 *
 * VRM初期化時は `SincroVrmPoseComposerService.reset()` で破棄する。
 * 意味に基づく動作のプリセットは前回状態を参照しない。保持した指の出力を観測へ昇格せず、Hand欠損時も実観測からの期限を評価する。
 */
export type SincroVrmPoseComposerSemanticFingerState = {
    previousFinger: Partial<Record<"left" | "right", FingerCurlObservation>>;
};

/**
 * 意味に基づく動作・指の層と、生成時の診断結果。
 *
 * `layers` は合成可能な層だけを含み、無効意図、最小プロファイル、Hand欠損、指ボーンの欠損などの
 * 抑制理由を `warnings` に残す。`previousFinger` は次フレームの短時間保持に使い、
 * 結果が空でも呼び出し側が保持・破棄を判断する。
 */
export type SincroVrmPoseComposerSemanticFingerLayerResult = {
    layers: VrmPoseLayer[];
    warnings: string[];
    previousFinger: SincroVrmPoseComposerSemanticFingerState["previousFinger"];
};

/**
 * 本番の最終姿勢へ合成する意味に基づく動作・指の層を保存済みスナップショットだけから作る。
 *
 * 完成版 `AvatarMotionProfile` がある場合は常に層生成を試みる。最小プロファイルでは警告だけを返す。
 * 再生と実時間処理で同じ入力契約を使い、無効な意図やHand欠損には警告を残す。
 * 意図の解析結果に関わらず指は観測時刻から期限を評価し、保持期限後は中立へ戻す。
 */
export function createSemanticFingerComposerLayers(
    profile: AvatarMotionProfile | MinimalAvatarMotionProfile,
    input: SincroVrmPoseComposerSemanticFingerInput | undefined,
    state: SincroVrmPoseComposerSemanticFingerState,
): SincroVrmPoseComposerSemanticFingerLayerResult {
    if (input === undefined) {
        return { layers: [], warnings: [], previousFinger: state.previousFinger };
    }
    if (profile.schemaVersion !== "sincro.avatar-motion-profile.v1") {
        return {
            layers: [],
            warnings: ["semantic_finger_application_profile_not_full"],
            previousFinger: state.previousFinger,
        };
    }
    const intent = parseMotionIntentState(input.intent);
    // 意図の欠損や停止は指の時計を止めない。観測済みの指は独立に期限を評価する。
    const warnings = intent.ok ? [] : ["semantic_finger_application_intent_invalid"];
    if (!input.hand) warnings.push("semantic_finger_application_hand_missing");
    const intentState = intent.ok ? intent.state : createDefaultMotionIntentState(0);
    const semantic = createSemanticMotionPoseLayer({ intent: intentState, profile });
    const intentAge = (input.poseMediaTimeMs ?? Number.NaN) - intentState.timestamp.mediaTimeMs;
    const intentWeight =
        input.trackingEnabled !== false && Number.isFinite(intentAge) && intentAge >= 0
            ? Math.max(0, 1 - intentAge / 250)
            : 0;
    for (const layer of semantic.layers) layer.weight *= intentWeight;
    const mediaTimeMs = input.mediaTimeMs ?? Number.NaN;
    const observedAtMs = input.observedAtMs ?? input.hand?.lastUpdatedAtMs;
    const hand =
        input.trackingEnabled === false && input.hand
            ? { ...input.hand, trackingEnabled: false }
            : input.hand;
    const previous = input.trackingEnabled === false ? {} : state.previousFinger;
    const previousFinger = { ...previous };
    for (const side of ["left", "right"] as const) {
        previousFinger[side] = observeFingerCurl(
            hand,
            side,
            observedAtMs,
            mediaTimeMs,
            previousFinger[side],
        );
    }
    const finger = createFingerCurlPoseLayers({
        hand,
        intent: intentState,
        intentWeight,
        profile,
        mediaTimeMs,
        observedAtMs,
        previous,
    });
    return {
        layers: [...semantic.layers, ...finger.layers],
        warnings: [
            ...warnings,
            ...semantic.debug.warnings,
            ...finger.debug.flatMap((snapshot) => snapshot.warnings),
        ],
        previousFinger,
    };
}
