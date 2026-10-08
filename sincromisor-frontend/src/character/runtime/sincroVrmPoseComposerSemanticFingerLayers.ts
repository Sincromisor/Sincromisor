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
import type { ComposerSemanticFingerApplicationMode } from "../retargeting/sincroPoseRetargetTypes";
import type { TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";
import type { VrmPoseLayer } from "../vrmPose/vrmPoseTypes";

/**
 * production composer に semantic / finger layer を追加するための snapshot-only 入力。
 *
 * `intent` は parser 境界で検証されるため `unknown` のまま受け、失敗時は警告を残し、指の保持期限だけは評価する。
 * `hand` は低次元 `SincroHandMotionSnapshot` に限定し、Gesture Recognizer raw result、MediaPipe raw landmark、
 * VRM Object3D、raw bone node はこの境界へ入れない。
 */
export type SincroVrmPoseComposerSemanticFingerInput = {
    mode: ComposerSemanticFingerApplicationMode;
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
 * VRM初期化と切り戻しフラグの変更時は `SincroVrmPoseComposerService.reset()` で破棄する。
 * semantic preset は前回 state を参照せず、保持した出力を観測へ昇格せず、Hand欠損時も実観測からの期限を評価する。
 */
export type SincroVrmPoseComposerSemanticFingerState = {
    previousFinger: Partial<Record<"left" | "right", FingerCurlObservation>>;
};

/**
 * semantic / finger layer 生成の observable result。
 *
 * `layers` は composer へ渡せる layer だけを含み、invalid intent、Minimal profile、Hand 欠損、missing
 * finger chain などの抑制理由は `warnings` に短い診断文字列として残す。`previousFinger` は次 frame の
 * short hold 用 state であり、result が空でも caller が lifecycle に応じて保持 / reset を判断する。
 */
export type SincroVrmPoseComposerSemanticFingerLayerResult = {
    layers: VrmPoseLayer[];
    warnings: string[];
    previousFinger: SincroVrmPoseComposerSemanticFingerState["previousFinger"];
};

/**
 * 本番の最終姿勢へ合成する意味に基づく動作・指の層を保存済みスナップショットだけから作る。
 *
 * 入力は parsed 可能な `MotionIntentState`、低次元 Hand snapshot、完成版 `AvatarMotionProfile` に限定する。
 * Gesture Recognizer raw result、MediaPipe raw landmark、VRM Object3D、raw bone node は受け取らないため、
 * replay と live の composer input が同じ contract で説明できる。invalid intent、Minimal profile、
 * Hand欠損では警告を残し、指を期限付きで保持して中立へ戻す。
 */
export function createSemanticFingerComposerLayers(
    profile: AvatarMotionProfile | MinimalAvatarMotionProfile,
    input: SincroVrmPoseComposerSemanticFingerInput | undefined,
    state: SincroVrmPoseComposerSemanticFingerState,
): SincroVrmPoseComposerSemanticFingerLayerResult {
    if (input === undefined) {
        return { layers: [], warnings: [], previousFinger: state.previousFinger };
    }
    if (input.mode !== "composer") {
        return { layers: [], warnings: ["semantic_finger_application_off"], previousFinger: {} };
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
