/**
 * MotionIntentState と AvatarMotionProfile から VRM 向け semantic pose layer を作る。
 * Temporal / Hand / raw gesture を再解釈せず、intent と profile preset だけを入力にして replay と live の出力差を抑える。
 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfile";
import type { VrmNormalizedLocalPose, VrmPoseLayer } from "../vrmPose/vrmPoseTypes";
import type {
    ArmMotionIntent,
    MotionIntentSideState,
    MotionIntentState,
} from "./motionIntentState";
import {
    createSidePose,
    presetIdForIntent,
    SEMANTIC_CONFLICT_SUPPRESSION_THRESHOLD,
    type SemanticMotionLayerSide,
    type SemanticMotionPosePresetId,
    type SemanticMotionSide,
    SIDE_BONES,
    SIDES,
} from "./semanticMotionPosePresets";

const SEMANTIC_DEBUG_SCHEMA_VERSION = "sincro.phase9-semantic-motion.v1" as const;

export type { SemanticMotionPosePresetId } from "./semanticMotionPosePresets";

export type SemanticMotionPoseLayerInput = {
    intent: MotionIntentState;
    profile: AvatarMotionProfile;
    previous?: SemanticMotionPoseLayerDebugSnapshot;
    deltaSeconds?: number;
};

export type SemanticMotionPoseLayerDebugSnapshot = {
    schemaVersion: typeof SEMANTIC_DEBUG_SCHEMA_VERSION;
    timestamp: { mediaTimeMs: number };
    presets: Array<{
        side: SemanticMotionLayerSide;
        intent: ArmMotionIntent;
        presetId: SemanticMotionPosePresetId | "none";
        layerId?: string;
        weights: { arm: number; wrist: number; fingers: number; layer: number };
        ownedBones: VRMHumanBoneName[];
        suppressedBones: VRMHumanBoneName[];
        warnings: string[];
    }>;
    warnings: string[];
};

export type SemanticMotionPoseLayerResult = {
    layers: VrmPoseLayer[];
    debug: SemanticMotionPoseLayerDebugSnapshot;
};

type SemanticPresetEntry = SemanticMotionPoseLayerDebugSnapshot["presets"][number];

type SemanticLayerCandidate = {
    side: SemanticMotionLayerSide;
    state: MotionIntentSideState;
    presetId: SemanticMotionPosePresetId;
    ownedBones: VRMHumanBoneName[];
    pose: VrmNormalizedLocalPose;
    blendMode: VrmPoseLayer["blendMode"];
    intentConfidence: number;
};

type SemanticWeights = SemanticPresetEntry["weights"];

export function createSemanticMotionPoseLayer(
    input: SemanticMotionPoseLayerInput,
): SemanticMotionPoseLayerResult {
    const warnings = new Set<string>();
    const layers: VrmPoseLayer[] = [];
    const presets: SemanticPresetEntry[] = [];
    const clapCandidate = createBothClapCandidate(input.intent);

    if (clapCandidate) {
        addCandidate(layers, presets, input.profile, clapCandidate, warnings);
    } else {
        for (const side of SIDES) {
            const candidate = createSideCandidate(side, input.intent.arms[side]);
            if (candidate) {
                addCandidate(layers, presets, input.profile, candidate, warnings);
            } else {
                const preset = createNoopPreset(side, input.intent.arms[side]);
                for (const warning of preset.warnings) {
                    warnings.add(warning);
                }
                presets.push(preset);
            }
        }
    }

    return {
        layers,
        debug: {
            schemaVersion: SEMANTIC_DEBUG_SCHEMA_VERSION,
            timestamp: { mediaTimeMs: input.intent.timestamp.mediaTimeMs },
            presets,
            warnings: [...warnings],
        },
    };
}

function createBothClapCandidate(intent: MotionIntentState): SemanticLayerCandidate | undefined {
    const left = intent.arms.left;
    const right = intent.arms.right;
    if (left.intent !== "clapLike" || right.intent !== "clapLike") {
        return undefined;
    }
    const state = mergeBothArmState(left, right);
    return {
        side: "both",
        state,
        presetId: "soft_clap_like",
        ownedBones: [...SIDE_BONES.left, ...SIDE_BONES.right],
        pose: {
            ...createSidePose("left", "soft_clap_like"),
            ...createSidePose("right", "soft_clap_like"),
        },
        blendMode: "override",
        intentConfidence: Math.min(left.confidence, right.confidence),
    };
}

function createSideCandidate(
    side: SemanticMotionSide,
    state: MotionIntentSideState,
): SemanticLayerCandidate | undefined {
    const presetId = presetIdForIntent(state.intent);
    if (presetId === "none") {
        return undefined;
    }
    const blendMode = presetId === "small_wave" ? "additive" : "override";
    return {
        side,
        state,
        presetId,
        ownedBones: SIDE_BONES[side],
        pose: createSidePose(side, presetId),
        blendMode,
        intentConfidence: state.confidence,
    };
}

function addCandidate(
    layers: VrmPoseLayer[],
    presets: SemanticPresetEntry[],
    profile: AvatarMotionProfile,
    candidate: SemanticLayerCandidate,
    warnings: Set<string>,
): void {
    const weights = createWeights(candidate.state, profile);
    const layerId = `semantic:${candidate.side}:${candidate.presetId}`;
    const presetWarnings = semanticWarnings(candidate.state.intent, candidate.side);
    for (const warning of presetWarnings) {
        warnings.add(warning);
    }
    layers.push({
        id: layerId,
        kind: "semantic",
        blendMode: candidate.blendMode,
        weight: weights.layer,
        pose: candidate.pose,
        ownedBones: candidate.ownedBones,
        metadata: {
            semantic: {
                side: candidate.side,
                intent: candidate.state.intent,
                intentConfidence: candidate.intentConfidence,
                conflictSuppressionThreshold: SEMANTIC_CONFLICT_SUPPRESSION_THRESHOLD,
            },
        },
    });
    presets.push({
        side: candidate.side,
        intent: candidate.state.intent,
        presetId: candidate.presetId,
        layerId,
        weights,
        ownedBones: candidate.ownedBones,
        suppressedBones: missingOptionalBones(candidate.ownedBones, profile),
        warnings: presetWarnings,
    });
}

function createNoopPreset(
    side: SemanticMotionSide,
    state: MotionIntentSideState,
): SemanticPresetEntry {
    const warnings = semanticWarnings(state.intent, side);
    return {
        side,
        intent: state.intent,
        presetId: "none",
        weights: { arm: 0, wrist: 0, fingers: 0, layer: 0 },
        ownedBones: [],
        suppressedBones: [],
        warnings,
    };
}

function createWeights(
    state: MotionIntentSideState,
    profile: AvatarMotionProfile,
): SemanticWeights {
    const strength = clamp01(state.confidence) * clamp01(state.expressiveness);
    const arm = clamp01(strength * profile.arm.reachScale);
    const wrist = clamp01(strength * profile.wrist.wristRollInfluence);
    const fingers = clamp01(strength * profile.fingers.curlScale);
    return { arm, wrist, fingers, layer: Math.max(arm, wrist, fingers) };
}

function semanticWarnings(intent: ArmMotionIntent, side: SemanticMotionLayerSide): string[] {
    if (intent === "guarded") {
        return ["guarded_semantic_pose_deferred"];
    }
    if (intent === "clapLike" && side !== "both") {
        return ["clap_like_requires_both_hands"];
    }
    if (intent === "lost" || intent === "fallback") {
        return ["semantic_fallback_active"];
    }
    return [];
}

function missingOptionalBones(
    ownedBones: readonly VRMHumanBoneName[],
    profile: AvatarMotionProfile,
): VRMHumanBoneName[] {
    return ownedBones.filter((bone) => profile.capabilities.bones[bone] === false);
}

function mergeBothArmState(
    left: MotionIntentSideState,
    right: MotionIntentSideState,
): MotionIntentSideState {
    return {
        intent: "clapLike",
        confidence: Math.min(left.confidence, right.confidence),
        reliability: Math.min(left.reliability, right.reliability),
        expressiveness: Math.min(left.expressiveness, right.expressiveness),
        ageMs: Math.min(left.ageMs, right.ageMs),
        stableDurationMs: Math.min(left.stableDurationMs, right.stableDurationMs),
        cooldownRemainingMs: Math.max(left.cooldownRemainingMs, right.cooldownRemainingMs),
        source: "mixed",
        warnings: uniqueWarnings([...left.warnings, ...right.warnings]),
    };
}

function uniqueWarnings(
    warnings: readonly MotionIntentSideState["warnings"][number][],
): MotionIntentSideState["warnings"] {
    return [...new Set(warnings)];
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}
