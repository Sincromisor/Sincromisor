/**
 * Hand snapshot と MotionIntentState から VRM finger curl 用の semantic pose layer を作る。
 * MediaPipe raw landmark や Gesture Recognizer raw result は読まず、低次元 finger feature と profile distribution だけを入力境界にする。
 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfile";
import type { VrmNormalizedLocalPose, VrmPoseLayer } from "../vrmPose/vrmPoseTypes";
import {
    addGroupPose,
    FINGER_CURL_GROUPS,
    type FingerCurlGroup,
    type FingerCurlSide,
    normalizedProfileDistribution,
} from "./fingerCurlPoseMapping";
import type { ArmMotionIntent, MotionIntentState } from "./motionIntentState";

const FINGER_CURL_DEBUG_SCHEMA_VERSION = "sincro.phase9-finger-curl-pose.v1" as const;
const PREVIOUS_HOLD_MS = 250;

/**
 * 片手分の finger curl layer 生成入力。
 *
 * Hand snapshot は低次元 features のみを読み、raw landmark は参照しない。`previous` は同じ side の
 * debug snapshot だけを short hold に使い、timestamp が逆行または `PREVIOUS_HOLD_MS` 超過の場合は破棄する。
 */
export type FingerCurlPoseLayerInput = {
    side: FingerCurlSide;
    hand: SincroHandMotionSnapshot;
    intent: MotionIntentState;
    profile: AvatarMotionProfile;
    mediaTimeMs: number;
    previous?: FingerCurlPoseDebugSnapshot;
};

/**
 * finger group ごとの curl 推定結果。
 *
 * `source` は保守上重要な fallback chain で、hand curl feature、openness、intent override、
 * previous hold、default の順に解決される。warning は mapping / profile capability 由来の診断だけを入れる。
 */
export type FingerCurlGroupState = {
    group: FingerCurlGroup;
    curl: number;
    source: "hand" | "openness" | "intent" | "previous" | "default";
    warnings: string[];
};

/**
 * Phase 9 finger curl の replay 用 debug snapshot。
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
 * 片手分の optional finger curl layer と debug snapshot。
 *
 * capability / distribution の結果 owned bone が 0 の場合は `layer` を返さず、debug snapshot だけを返す。
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
 * pointing、thumbs-up、peace などの intent override は curl 値の上限 / 下限だけを調整し、VRM runtime へ
 * 直接書き込む副作用はない。
 */
export function createFingerCurlPoseLayer(
    input: FingerCurlPoseLayerInput,
): FingerCurlPoseLayerResult {
    const warnings = new Set<string>();
    const distribution = normalizedProfileDistribution(input.profile, warnings);
    const groups = createGroupStates(input);
    const pose: VrmNormalizedLocalPose = {};
    const ownedBones: VRMHumanBoneName[] = [];

    for (const groupState of groups) {
        addGroupPose(input, groupState, distribution, pose, ownedBones, warnings);
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
 * `previous` は side ごとに分離して渡し、片手欠損や reduced chain の warning は各 debug snapshot に残す。
 * 返す `layers` は実際に owned bone を持つ side だけで、空配列でも debug は左右分を必ず返す。
 */
export function createFingerCurlPoseLayers(
    input: Omit<FingerCurlPoseLayerInput, "side" | "previous"> & {
        previous?: Partial<Record<FingerCurlSide, FingerCurlPoseDebugSnapshot>>;
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

function createGroupStates(input: FingerCurlPoseLayerInput): FingerCurlGroupState[] {
    const sideHand = input.side === "left" ? input.hand.leftHand : input.hand.rightHand;
    const previous = input.previous?.side === input.side ? input.previous : undefined;
    return FINGER_CURL_GROUPS.map((group) =>
        scaleGroupState(
            applyIntentOverride(
                resolveBaseGroupState(group, sideHand.features, previous, input),
                input.intent.arms[input.side].intent,
            ),
            input.profile.fingers.curlScale,
        ),
    );
}

function resolveBaseGroupState(
    group: FingerCurlGroup,
    features: SincroHandMotionSnapshot["leftHand"]["features"],
    previous: FingerCurlPoseDebugSnapshot | undefined,
    input: FingerCurlPoseLayerInput,
): FingerCurlGroupState {
    const handCurl = handCurlForGroup(group, features);
    if (handCurl !== undefined) {
        return { group, curl: clamp01(handCurl), source: "hand", warnings: [] };
    }
    if (features.openness === "open") {
        return { group, curl: 0, source: "openness", warnings: [] };
    }
    if (features.openness === "half") {
        return { group, curl: 0.55, source: "openness", warnings: [] };
    }
    if (features.openness === "closed") {
        return { group, curl: 1, source: "openness", warnings: [] };
    }
    return (
        previousGroupState(group, previous, input.mediaTimeMs) ?? {
            group,
            curl: 0,
            source: "default",
            warnings: [],
        }
    );
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

function previousGroupState(
    group: FingerCurlGroup,
    previous: FingerCurlPoseDebugSnapshot | undefined,
    mediaTimeMs: number,
): FingerCurlGroupState | undefined {
    const previousGroup = previous?.groups.find((state) => state.group === group);
    if (!previous || !previousGroup) {
        return undefined;
    }
    const dtMs = mediaTimeMs - previous.timestamp.mediaTimeMs;
    if (!Number.isFinite(dtMs) || dtMs < 0 || dtMs > PREVIOUS_HOLD_MS) {
        return undefined;
    }
    return { group, curl: clamp01(previousGroup.curl), source: "previous", warnings: [] };
}

function applyIntentOverride(
    state: FingerCurlGroupState,
    intent: ArmMotionIntent,
): FingerCurlGroupState {
    const curl = intentOverrideCurl(state.group, state.curl, intent);
    if (curl === undefined) {
        return state;
    }
    return { ...state, curl, source: "intent" };
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
    if (state.source === "previous") {
        return { ...state, curl: clamp01(state.curl) };
    }
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
