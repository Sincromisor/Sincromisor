import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfile";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import {
    createFingerCurlPoseLayers,
    type FingerCurlPoseDebugSnapshot,
} from "../motionIntent/fingerCurlPoseLayer";
import { parseMotionIntentState } from "../motionIntent/motionIntentState";
import { createSemanticMotionPoseLayer } from "../motionIntent/semanticMotionPoseLayer";
import type { ComposerSemanticFingerApplicationMode } from "../retargeting/sincroPoseRetargetTypes";
import type { VrmPoseLayer } from "../vrmPose/vrmPoseTypes";

/**
 * production composer に semantic / finger layer を追加するための snapshot-only 入力。
 *
 * `intent` は parser 境界で検証されるため `unknown` のまま受け、失敗時は warning 付きで layer を生成しない。
 * `hand` は低次元 `SincroHandMotionSnapshot` に限定し、Gesture Recognizer raw result、MediaPipe raw landmark、
 * VRM Object3D、raw bone node はこの境界へ入れない。
 */
export type SincroVrmPoseComposerSemanticFingerInput = {
    mode: ComposerSemanticFingerApplicationMode;
    intent?: unknown;
    hand?: SincroHandMotionSnapshot;
};

/**
 * finger previous hold だけを composer dry-run service が frame 間で保持する state。
 *
 * profile / rollback flag / VRM lifecycle の切替時は `SincroVrmPoseComposerDryRunService.reset()` で破棄する。
 * semantic preset は前回 state を参照せず、Hand 欠損時にも previous を layer として昇格しない。
 */
export type SincroVrmPoseComposerSemanticFingerState = {
    previousFinger: Partial<Record<"left" | "right", FingerCurlPoseDebugSnapshot>>;
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
 * production dry-run 用の semantic pose / finger curl layer を保存済み snapshot だけから作る。
 *
 * 入力は parsed 可能な `MotionIntentState`、低次元 Hand snapshot、完成版 `AvatarMotionProfile` に限定する。
 * Gesture Recognizer raw result、MediaPipe raw landmark、VRM Object3D、raw bone node は受け取らないため、
 * replay と live の composer input が同じ contract で説明できる。invalid intent、Minimal profile、
 * Hand 欠損は warning 付きで該当 layer を追加しない。
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
    if (!intent.ok) {
        return {
            layers: [],
            warnings: [
                "semantic_finger_application_intent_invalid",
                ...intent.errors.map(
                    (error) => `intent_invalid:${error.code}:${error.path.join(".")}`,
                ),
            ],
            previousFinger: state.previousFinger,
        };
    }

    const semantic = createSemanticMotionPoseLayer({
        intent: intent.state,
        profile,
    });
    if (input.hand === undefined) {
        return {
            layers: semantic.layers,
            warnings: [...semantic.debug.warnings, "semantic_finger_application_hand_missing"],
            previousFinger: state.previousFinger,
        };
    }

    const finger = createFingerCurlPoseLayers({
        hand: input.hand,
        intent: intent.state,
        profile,
        mediaTimeMs: intent.state.timestamp.mediaTimeMs,
        previous: state.previousFinger,
    });
    const previousFinger = finger.debug.reduce<
        SincroVrmPoseComposerSemanticFingerState["previousFinger"]
    >((acc, snapshot) => {
        acc[snapshot.side] = snapshot;
        return acc;
    }, {});
    return {
        layers: [...semantic.layers, ...finger.layers],
        warnings: [
            ...semantic.debug.warnings,
            ...finger.debug.flatMap((snapshot) => snapshot.warnings),
        ],
        previousFinger,
    };
}
