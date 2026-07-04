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

export type SincroVrmPoseComposerSemanticFingerInput = {
    mode: ComposerSemanticFingerApplicationMode;
    intent?: unknown;
    hand?: SincroHandMotionSnapshot;
};

export type SincroVrmPoseComposerSemanticFingerState = {
    previousFinger: Partial<Record<"left" | "right", FingerCurlPoseDebugSnapshot>>;
};

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
