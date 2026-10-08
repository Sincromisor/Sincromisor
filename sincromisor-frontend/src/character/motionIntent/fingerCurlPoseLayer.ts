/**
 * Hand snapshot と MotionIntentState から VRM finger curl 用の semantic pose layer を作る。
 * MediaPipe raw landmark や Gesture Recognizer raw result は読まず、低次元 finger feature と profile distribution だけを入力境界にする。
 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import {
    DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
    type SincroHandMotionSnapshot,
} from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfileTypes";
import type { VrmNormalizedLocalPose, VrmPoseLayer } from "../vrmPose/vrmPoseTypes";
import {
    type FingerCurlObservation,
    isFingerObservationFresh,
    observeFingerCurl,
} from "./fingerCurlObservation";
import {
    addGroupPose,
    FINGER_CURL_GROUPS,
    type FingerCurlGroup,
    type FingerCurlSide,
    normalizedProfileDistribution,
} from "./fingerCurlPoseMapping";
import type { ArmMotionIntent, MotionIntentState } from "./motionIntentState";

const FINGER_CURL_DEBUG_SCHEMA_VERSION = "sincro.phase9-finger-curl-pose.v1" as const;

/**
 * 片手分の finger curl layer 生成入力。
 *
 * Hand snapshot は低次元 features のみを読み、raw landmark は参照しない。`previous` は同じ side の
 * 未加工の有効観測だけを保持に使い、逆行または観測から250ms超過の場合は中立に戻す。
 */
export type FingerCurlPoseLayerInput = {
    side: FingerCurlSide;
    hand?: SincroHandMotionSnapshot;
    intent: MotionIntentState;
    /** Pose時計で評価済みの意図の新鮮さ。観測曲げがない群だけを補う。 */
    intentWeight?: number;
    profile: AvatarMotionProfile;
    mediaTimeMs: number;
    previous?: FingerCurlObservation;
    observedAtMs?: number;
};

/**
 * finger group ごとの curl 推定結果。
 *
 * `source` は現在または保持中の曲げ・開閉の観測を優先し、欠ける群だけ意図、最後に中立で補う。
 * `warnings` にはボーンへの変換とプロファイルの対応範囲による診断を残す。
 */
export type FingerCurlGroupState = {
    group: FingerCurlGroup;
    curl: number;
    source: "hand" | "openness" | "intent" | "previous" | "default";
    warnings: string[];
};

/**
 * Phase 9 finger curl の replay 用 診断スナップショット。
 *
 * `ownedBones` は profile capability と distribution で実際に layer が所有した bone だけを含む。
 * reduced finger chain では missing-chain warning を残し、存在しない intermediate / distal bone を所有しない。
 */
export type FingerCurlPoseDebugSnapshot = {
    schemaVersion: typeof FINGER_CURL_DEBUG_SCHEMA_VERSION;
    side: FingerCurlSide;
    timestamp: { mediaTimeMs: number };
    groups: FingerCurlGroupState[];
    ownedBones: VRMHumanBoneName[];
    warnings: string[];
};

/**
 * 片手分の optional finger curl layer と 診断スナップショット。
 *
 * capability / distribution の結果 owned bone が 0 の場合は `layer` を返さず、診断スナップショット だけを返す。
 * caller は missing chain warning と owned bone list から、composer conflict が起きていないことを確認できる。
 */
export type FingerCurlPoseLayerResult = {
    layer?: VrmPoseLayer;
    debug: FingerCurlPoseDebugSnapshot;
};

/**
 * 片手分の finger curl を VrmPoseComposer layer に変換する。
 *
 * curl source は hand feature を優先し、欠損時だけ openness / previous hold / default に落とす。
 * 観測された曲げは意図で変えず、未観測の群だけ新鮮な意図で補う。VRM runtime へ
 * 直接書き込む副作用はない。
 */
export function createFingerCurlPoseLayer(
    input: FingerCurlPoseLayerInput,
): FingerCurlPoseLayerResult {
    const warnings = new Set<string>();
    const distribution = normalizedProfileDistribution(input.profile, warnings);
    const previous = input.previous?.side === input.side ? input.previous : undefined;
    const observation = observeFingerCurl(
        input.hand,
        input.side,
        input.observedAtMs ?? input.hand?.lastUpdatedAtMs,
        input.mediaTimeMs,
        previous,
    );
    const fresh = isFingerObservationFresh(observation, input.mediaTimeMs);
    const groups = createGroupStates(input, fresh ? observation : undefined);
    const mappingInput = {
        side: input.side,
        profile: input.profile,
        features: fresh ? observation.features : DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
    };
    const pose: VrmNormalizedLocalPose = {};
    const ownedBones: VRMHumanBoneName[] = [];

    for (const groupState of groups) {
        addGroupPose(mappingInput, groupState, distribution, pose, ownedBones, warnings);
    }

    const debug = {
        schemaVersion: FINGER_CURL_DEBUG_SCHEMA_VERSION,
        side: input.side,
        timestamp: { mediaTimeMs: input.mediaTimeMs },
        groups,
        ownedBones,
        warnings: [...warnings],
    };
    if (ownedBones.length === 0) {
        return { debug };
    }
    return {
        layer: {
            id: `finger-curl:${input.side}`,
            kind: "semantic",
            blendMode: "additive",
            weight: 1,
            pose,
            ownedBones,
        },
        debug,
    };
}

/**
 * 左右の finger curl layer をまとめて生成する。
 *
 * `previous` は side ごとに分離して渡し、片手欠損や reduced chain の warning は各 診断スナップショット に残す。
 * 返す `layers` は実際に owned bone を持つ side だけで、空配列でも debug は左右分を必ず返す。
 */
export function createFingerCurlPoseLayers(
    input: Omit<FingerCurlPoseLayerInput, "side" | "previous"> & {
        previous?: Partial<Record<FingerCurlSide, FingerCurlObservation>>;
    },
): { layers: VrmPoseLayer[]; debug: FingerCurlPoseDebugSnapshot[] } {
    const left = createFingerCurlPoseLayer({
        ...input,
        side: "left",
        previous: input.previous?.left,
    });
    const right = createFingerCurlPoseLayer({
        ...input,
        side: "right",
        previous: input.previous?.right,
    });
    const layers: VrmPoseLayer[] = [];
    if (left.layer !== undefined) {
        layers.push(left.layer);
    }
    if (right.layer !== undefined) {
        layers.push(right.layer);
    }
    return {
        layers,
        debug: [left.debug, right.debug],
    };
}

function createGroupStates(
    input: FingerCurlPoseLayerInput,
    observation?: FingerCurlObservation,
): FingerCurlGroupState[] {
    return FINGER_CURL_GROUPS.map((group) => {
        const state = observation
            ? resolveBaseGroupState(
                  group,
                  observation.features,
                  observation === input.previous ? "previous" : "hand",
              )
            : { group, curl: 0, source: "default" as const, warnings: [] };
        return scaleGroupState(
            state.source === "default" && (input.intentWeight ?? 0) > 0
                ? applyIntentOverride(
                      state,
                      input.intent.arms[input.side].intent,
                      (input.intentWeight ?? 0) * clamp01(input.intent.arms[input.side].confidence),
                  )
                : state,
            input.profile.fingers.curlScale,
        );
    });
}

// 保持値も未加工の特徴から求め、出力尺度を再び観測へ戻さない。
function resolveBaseGroupState(
    group: FingerCurlGroup,
    features: SincroHandMotionSnapshot["leftHand"]["features"],
    source: "hand" | "previous",
): FingerCurlGroupState {
    const curl = handCurlForGroup(group, features);
    if (curl !== undefined) return { group, curl: clamp01(curl), source, warnings: [] };
    const openness = features.openness;
    if (openness !== "unknown")
        return {
            group,
            curl: openness === "open" ? 0 : openness === "half" ? 0.55 : 1,
            source: source === "previous" ? source : "openness",
            warnings: [],
        };
    return { group, curl: 0, source: "default", warnings: [] };
}

function handCurlForGroup(
    group: FingerCurlGroup,
    features: SincroHandMotionSnapshot["leftHand"]["features"],
): number | undefined {
    if (group === "ringLittle") {
        return averageFinite([features.fingerCurl.ring, features.fingerCurl.little]);
    }
    const curl = features.fingerCurl[group];
    return Number.isFinite(curl) ? curl : undefined;
}

function applyIntentOverride(
    state: FingerCurlGroupState,
    intent: ArmMotionIntent,
    weight: number,
): FingerCurlGroupState {
    const curl = intentOverrideCurl(state.group, state.curl, intent);
    if (curl === undefined) {
        return state;
    }
    return { ...state, curl: state.curl + (curl - state.curl) * weight, source: "intent" };
}

function intentOverrideCurl(
    group: FingerCurlGroup,
    curl: number,
    intent: ArmMotionIntent,
): number | undefined {
    if (intent === "pointing") {
        return pointingCurl(group, curl);
    }
    if (intent === "thumbsUp") {
        return group === "thumb" ? Math.min(curl, 0.2) : Math.max(curl, 0.8);
    }
    if (intent === "peace") {
        if (group === "index" || group === "middle") {
            return Math.min(curl, 0.15);
        }
        return group === "ringLittle" ? Math.max(curl, 0.75) : undefined;
    }
    if (intent === "wave" || intent === "explain") {
        return Math.min(curl, 0.35);
    }
    return undefined;
}

function pointingCurl(group: FingerCurlGroup, curl: number): number {
    if (group === "index") {
        return Math.min(curl, 0.15);
    }
    if (group === "thumb") {
        return Math.max(curl, 0.35);
    }
    return Math.max(curl, 0.75);
}

function scaleGroupState(state: FingerCurlGroupState, curlScale: number): FingerCurlGroupState {
    const scale = Number.isFinite(curlScale) ? curlScale : 1;
    return { ...state, curl: clamp01(state.curl * scale) };
}

function averageFinite(values: readonly number[]): number | undefined {
    const finite = values.filter((value) => Number.isFinite(value));
    if (finite.length === 0) {
        return undefined;
    }
    return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}
